use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    process::Command,
    sync::Mutex,
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

const MAX_FILE_SIZE: u64 = 1024 * 1024;
const MAX_PASTED_IMAGE_SIZE: usize = 10 * 1024 * 1024;
const MAX_TASK_TEMPLATE_SIZE: usize = 64 * 1024;
const TERMINAL_OUTPUT_EVENT_PREFIX: &str = "terminal-output:";
const TERMINAL_OUTPUT_BUFFER_SIZE: usize = 16 * 1024;
const WORKSPACE_DIR: &str = "workspace";
const SHARED_SKILLS_DIR: &str = ".agents/skills";
const CUSTOM_SHELL_APP_DIR: &str = "custom-shell";
const DATABASE_SETUP_SCRIPT: &str = "scripts/setup-database.mjs";
const DEFAULT_TASK_TEMPLATE: &str = "---\nstatus: active\n---\n\n";
const NEW_APP_NAME_ALLOWED_MESSAGE: &str =
    "Use lowercase letters, numbers, hyphens, or underscores for the app name.";

#[derive(Default)]
struct WorkspaceState {
    inner: Mutex<AppState>,
    terminals: Mutex<HashMap<String, TerminalSession>>,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppState {
    active_workspace_id: Option<String>,
    next_workspace_index: u32,
    workspaces: Vec<WorkspaceRecord>,
    #[serde(default)]
    editor_settings: EditorSettings,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditorSettings {
    #[serde(default = "default_task_template")]
    default_task_template: String,
}

impl Default for EditorSettings {
    fn default() -> Self {
        Self {
            default_task_template: default_task_template(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceRecord {
    id: String,
    name: String,
    app_name: String,
    #[serde(default)]
    hidden: bool,
    branch: String,
    git_root: PathBuf,
    worktree_root: PathBuf,
    app_root: PathBuf,
    app_relative_path: String,
}

struct TerminalSession {
    workspace_id: String,
    master: Box<dyn MasterPty + Send>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn Child + Send>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceList {
    active_workspace_id: Option<String>,
    workspaces: Vec<WorkspaceInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceInfo {
    id: String,
    name: String,
    app_name: String,
    hidden: bool,
    is_standalone: bool,
    is_tauri: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskItem {
    title: String,
    path: String,
    status: String,
    skill: Option<String>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SkillItem {
    name: String,
    slug: String,
    path: String,
    tags: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DocItem {
    name: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitFile {
    status: String,
    path: String,
    app_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiffHunk {
    original_start: usize,
    original_count: usize,
    current_start: usize,
    current_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitCommit {
    hash: String,
    subject: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitStatus {
    branch: String,
    files: Vec<GitFile>,
    unpushed_commit_count: u32,
    unmerged_commit_count: u32,
    develop_commit_count: u32,
    merge_commits: Vec<GitCommit>,
    merge_files: Vec<GitFile>,
    develop_commits: Vec<GitCommit>,
    develop_files: Vec<GitFile>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalOutput {
    workspace_id: String,
    terminal_id: String,
    data: Vec<u8>,
}

impl WorkspaceState {
    fn load(app: &AppHandle) -> Self {
        let mut state = AppState {
            next_workspace_index: 1,
            ..AppState::default()
        };

        if let Ok(path) = state_path(app) {
            if let Ok(contents) = fs::read_to_string(path) {
                if let Ok(saved) = serde_json::from_str::<AppState>(&contents) {
                    state = saved;
                }
            }
        }

        if state.next_workspace_index == 0 {
            state.next_workspace_index = 1;
        }

        Self {
            inner: Mutex::new(state),
            terminals: Mutex::new(HashMap::new()),
        }
    }

    fn save(&self, app: &AppHandle) -> Result<(), String> {
        let path = state_path(app)?;
        let state = self
            .inner
            .lock()
            .map_err(|_| "Workspace state is unavailable".to_string())?;
        let contents = serde_json::to_string_pretty(&*state).map_err(|error| error.to_string())?;
        fs::write(path, contents).map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn list_workspaces(state: State<'_, WorkspaceState>) -> Result<WorkspaceList, String> {
    workspace_list(&state)
}

#[tauri::command]
fn get_editor_settings(state: State<'_, WorkspaceState>) -> Result<EditorSettings, String> {
    editor_settings(&state)
}

#[tauri::command]
fn save_editor_settings(
    app: AppHandle,
    settings: EditorSettings,
    state: State<'_, WorkspaceState>,
) -> Result<EditorSettings, String> {
    validate_editor_settings(&settings)?;

    {
        let mut app_state = state
            .inner
            .lock()
            .map_err(|_| "Workspace state is unavailable".to_string())?;
        app_state.editor_settings = settings.clone();
    }

    state.save(&app)?;
    Ok(settings)
}

#[tauri::command]
async fn create_workspace(
    app: AppHandle,
    state: State<'_, WorkspaceState>,
) -> Result<Option<WorkspaceList>, String> {
    let Some(selected) = app
        .dialog()
        .file()
        .set_title("Select App Folder")
        .blocking_pick_folder()
    else {
        return Ok(None);
    };

    let selected = selected
        .into_path()
        .map_err(|_| "Selected folder is not a local path".to_string())?;
    let app_folder = fs::canonicalize(selected).map_err(|error| error.to_string())?;

    if !app_folder.is_dir() {
        return Err("Selected path is not a folder".to_string());
    }

    add_workspace_for_app(&app, &state, app_folder).map(Some)
}

#[tauri::command]
async fn create_app_from_custom_shell(
    app_name: String,
    app: AppHandle,
    state: State<'_, WorkspaceState>,
) -> Result<Option<WorkspaceList>, String> {
    let app_name = validate_new_app_name(&app_name)?;
    let Some(selected) = app
        .dialog()
        .file()
        .set_title("Select App Parent Folder Inside Repo")
        .blocking_pick_folder()
    else {
        return Ok(None);
    };

    let selected = selected
        .into_path()
        .map_err(|_| "Selected folder is not a local path".to_string())?;
    let parent_folder = fs::canonicalize(selected).map_err(|error| error.to_string())?;

    if !parent_folder.is_dir() {
        return Err("Selected path is not a folder".to_string());
    }

    let (git_root, app_relative_path) = new_app_repo_target(&parent_folder, &app_name)?;
    let scaffold_root = custom_shell_scaffold_dir()?;
    add_workspace_for_new_app(
        &app,
        &state,
        git_root,
        app_relative_path,
        &scaffold_root,
        &app_name,
    )
    .map(Some)
}

fn add_workspace_for_app(
    app: &AppHandle,
    state: &State<'_, WorkspaceState>,
    app_folder: PathBuf,
) -> Result<WorkspaceList, String> {
    if !app_folder.is_dir() {
        return Err("Selected path is not a folder".to_string());
    }

    let git_root = git_root_for(&app_folder)?;
    let app_relative_path = relative_path(&git_root, &app_folder)?;
    let app_name = app_folder
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "Workspace".to_string());

    add_workspace_with(
        app,
        state,
        git_root,
        app_relative_path,
        app_name,
        |app_root| copy_local_env_files(&app_folder, app_root),
    )
}

fn add_workspace_with<F>(
    app: &AppHandle,
    state: &State<'_, WorkspaceState>,
    git_root: PathBuf,
    app_relative_path: String,
    app_name: String,
    prepare_app_root: F,
) -> Result<WorkspaceList, String>
where
    F: FnOnce(&Path) -> Result<(), String>,
{
    let mut app_state = state
        .inner
        .lock()
        .map_err(|_| "Workspace state is unavailable".to_string())?;
    let (id, index) = next_workspace_id(app, &app_state, &git_root)?;
    let name = format!("Workspace #{}", index);
    let branch = format!("personal-ide/{}", id);
    let worktree_root = worktrees_dir(app)?.join(&id);
    let app_root = if app_relative_path.is_empty() {
        worktree_root.clone()
    } else {
        worktree_root.join(&app_relative_path)
    };

    run_git(
        &git_root,
        &[
            "worktree",
            "add",
            "-b",
            &branch,
            path_arg(&worktree_root).as_str(),
            "HEAD",
        ],
    )?;

    let (worktree_root, app_root) =
        match prepare_workspace_app_root(&worktree_root, &app_root, prepare_app_root) {
            Ok(paths) => paths,
            Err(error) => {
                if let Err(cleanup_error) =
                    cleanup_created_worktree(&git_root, &worktree_root, &branch)
                {
                    return Err(format!(
                        "{error}; cleanup failed after workspace setup error: {cleanup_error}"
                    ));
                }
                return Err(error);
            }
        };

    app_state.next_workspace_index = index + 1;
    app_state.active_workspace_id = Some(id.clone());
    app_state.workspaces.push(WorkspaceRecord {
        id,
        name,
        app_name,
        hidden: false,
        branch,
        git_root,
        worktree_root,
        app_root,
        app_relative_path,
    });
    drop(app_state);

    state.save(app)?;
    workspace_list(state)
}

fn prepare_workspace_app_root<F>(
    worktree_root: &Path,
    app_root: &Path,
    prepare_app_root: F,
) -> Result<(PathBuf, PathBuf), String>
where
    F: FnOnce(&Path) -> Result<(), String>,
{
    prepare_app_root(app_root)?;
    create_support_dirs(app_root)?;
    let worktree_root = fs::canonicalize(worktree_root).map_err(|error| error.to_string())?;
    let app_root = fs::canonicalize(app_root).map_err(|error| error.to_string())?;
    Ok((worktree_root, app_root))
}

fn add_workspace_for_new_app(
    app: &AppHandle,
    state: &State<'_, WorkspaceState>,
    git_root: PathBuf,
    app_relative_path: String,
    scaffold_root: &Path,
    app_name: &str,
) -> Result<WorkspaceList, String> {
    if app_relative_path.is_empty() {
        return Err("New app path must be inside the selected repo".to_string());
    }
    let database_port = generated_database_port(app_name, &used_generated_database_ports(state)?)?;

    add_workspace_with(
        app,
        state,
        git_root,
        app_relative_path,
        app_name.to_string(),
        |app_root| {
            copy_scaffold_dir(scaffold_root, app_root)?;
            rewrite_scaffold_metadata(app_root, app_name, database_port)
        },
    )
}

#[tauri::command]
fn set_active_workspace(
    workspace_id: String,
    app: AppHandle,
    state: State<'_, WorkspaceState>,
) -> Result<WorkspaceList, String> {
    let mut app_state = state
        .inner
        .lock()
        .map_err(|_| "Workspace state is unavailable".to_string())?;

    if !app_state
        .workspaces
        .iter()
        .any(|workspace| workspace.id == workspace_id)
    {
        return Err("Workspace not found".to_string());
    }

    app_state.active_workspace_id = Some(workspace_id);
    drop(app_state);

    state.save(&app)?;
    workspace_list(&state)
}

#[tauri::command]
fn set_workspace_hidden(
    workspace_id: String,
    hidden: bool,
    app: AppHandle,
    state: State<'_, WorkspaceState>,
) -> Result<WorkspaceList, String> {
    if hidden {
        kill_terminals_for_workspace(&workspace_id, &state)?;
    }

    let mut app_state = state
        .inner
        .lock()
        .map_err(|_| "Workspace state is unavailable".to_string())?;

    let Some(index) = app_state
        .workspaces
        .iter()
        .position(|workspace| workspace.id == workspace_id)
    else {
        return Err("Workspace not found".to_string());
    };
    app_state.workspaces[index].hidden = hidden;

    if app_state.active_workspace_id.as_deref() == Some(&workspace_id) {
        app_state.active_workspace_id = app_state
            .workspaces
            .iter()
            .find(|workspace| !workspace.hidden)
            .map(|workspace| workspace.id.clone());
    } else if app_state.active_workspace_id.is_none() && !hidden {
        app_state.active_workspace_id = Some(workspace_id);
    }
    drop(app_state);

    state.save(&app)?;
    workspace_list(&state)
}

#[tauri::command]
fn delete_workspace(
    workspace_id: String,
    app: AppHandle,
    state: State<'_, WorkspaceState>,
) -> Result<WorkspaceList, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;

    if workspace.worktree_root.exists() && !git_status_lines(&workspace.worktree_root)?.is_empty() {
        return Err(
            "Workspace has uncommitted changes. Commit or discard them before deleting."
                .to_string(),
        );
    }
    ensure_workspace_branch_can_be_deleted(&workspace)?;

    kill_terminals_for_workspace(&workspace_id, &state)?;

    if workspace.worktree_root.exists() {
        run_git(
            &workspace.git_root,
            &[
                "worktree",
                "remove",
                path_arg(&workspace.worktree_root).as_str(),
            ],
        )?;
    }
    delete_workspace_branch(&workspace.git_root, &workspace.branch)?;

    let mut app_state = state
        .inner
        .lock()
        .map_err(|_| "Workspace state is unavailable".to_string())?;
    app_state
        .workspaces
        .retain(|workspace| workspace.id != workspace_id);
    if let Some(index) = workspace_index(&workspace_id) {
        app_state.next_workspace_index = app_state.next_workspace_index.min(index);
    }

    if app_state.active_workspace_id.as_deref() == Some(&workspace_id) {
        app_state.active_workspace_id = app_state
            .workspaces
            .first()
            .map(|workspace| workspace.id.clone());
    }
    drop(app_state);

    state.save(&app)?;
    workspace_list(&state)
}

#[tauri::command]
fn list_dir(
    workspace_id: String,
    path: Option<String>,
    state: State<'_, WorkspaceState>,
) -> Result<Vec<FileEntry>, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let folder = resolve_inside(&workspace.app_root, path.as_deref())?;

    if !folder.is_dir() {
        return Err("Path is not a folder".to_string());
    }

    let mut entries = Vec::new();

    for entry in fs::read_dir(&folder).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;

        if !file_type.is_dir() && !file_type.is_file() {
            continue;
        }

        let path = entry.path();
        entries.push(FileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: relative_path(&workspace.app_root, &path)?,
            is_dir: file_type.is_dir(),
        });
    }

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

#[tauri::command]
fn read_text_file(
    workspace_id: String,
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<String, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let file = resolve_editable_path(&workspace, &path)?;
    read_text_file_path(&file)
}

#[tauri::command]
fn read_repo_text_file(
    workspace_id: String,
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<String, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let repo_path = clean_repo_path(&path)?;
    read_text_file_at(&workspace.worktree_root, &repo_path)
}

#[tauri::command]
fn read_original_text_file(
    workspace_id: String,
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<String, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    read_git_text_file(&workspace, &path, "HEAD")
}

#[tauri::command]
fn read_original_repo_text_file(
    workspace_id: String,
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<String, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    read_git_repo_text_file(&workspace, &path, "HEAD")
}

#[tauri::command]
fn read_develop_text_file(
    workspace_id: String,
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<String, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    read_git_text_file(&workspace, &path, "develop")
}

#[tauri::command]
fn read_develop_repo_text_file(
    workspace_id: String,
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<String, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    read_git_repo_text_file(&workspace, &path, "develop")
}

fn read_git_text_file(
    workspace: &WorkspaceRecord,
    path: &str,
    reference: &str,
) -> Result<String, String> {
    let repo_path = repo_path_for_app_path(workspace, path)?;
    read_git_repo_text_file(workspace, &repo_path, reference)
}

fn read_git_repo_text_file(
    workspace: &WorkspaceRecord,
    path: &str,
    reference: &str,
) -> Result<String, String> {
    let repo_path = clean_repo_path(path)?;
    let output = Command::new("git")
        .arg("-C")
        .arg(&workspace.worktree_root)
        .arg("show")
        .arg(format!("{}:{}", reference, repo_path))
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Ok(String::new());
    }

    if output.stdout.len() as u64 > MAX_FILE_SIZE {
        return Err("File is larger than 1 MiB".to_string());
    }

    if output.stdout.contains(&0) {
        return Err("Binary files are not supported".to_string());
    }

    String::from_utf8(output.stdout).map_err(|_| "Binary files are not supported".to_string())
}

#[tauri::command]
fn write_text_file(
    workspace_id: String,
    path: String,
    contents: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let file = resolve_editable_path(&workspace, &path)?;
    write_text_file_path(&file, &contents)
}

#[tauri::command]
fn write_repo_text_file(
    workspace_id: String,
    path: String,
    contents: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let repo_path = clean_repo_path(&path)?;
    let file = resolve_inside(&workspace.worktree_root, Some(&repo_path))?;
    write_text_file_path(&file, &contents)
}

fn write_text_file_path(file: &Path, contents: &str) -> Result<(), String> {
    let metadata = fs::metadata(file).map_err(|error| error.to_string())?;

    if !metadata.is_file() {
        return Err("Path is not a file".to_string());
    }

    if contents.len() as u64 > MAX_FILE_SIZE {
        return Err("File is larger than 1 MiB".to_string());
    }

    let existing = fs::read(file).map_err(|error| error.to_string())?;
    if existing.contains(&0) || String::from_utf8(existing).is_err() {
        return Err("Binary files are not supported".to_string());
    }

    fs::write(file, contents).map_err(|error| error.to_string())
}

#[tauri::command]
fn create_text_file(
    workspace_id: String,
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<FileEntry, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let path = path.trim();
    if path.is_empty() {
        return Err("File path is required".to_string());
    }

    let file = resolve_new_path_inside(&workspace.app_root, path)?;
    if file.exists() {
        return Err("File already exists".to_string());
    }
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    fs::write(&file, "").map_err(|error| error.to_string())?;

    Ok(FileEntry {
        name: file
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "Untitled".to_string()),
        path: relative_path(&workspace.app_root, &file)?,
        is_dir: false,
    })
}

#[tauri::command]
fn create_pasted_image(
    workspace_id: String,
    extension: String,
    bytes: Vec<u8>,
    state: State<'_, WorkspaceState>,
) -> Result<FileEntry, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let extension = match extension.trim().to_lowercase().as_str() {
        "gif" => "gif",
        "jpeg" | "jpg" => "jpg",
        "png" => "png",
        "webp" => "webp",
        _ => return Err("Only PNG, JPEG, WebP, or GIF images can be pasted".to_string()),
    };
    if bytes.is_empty() {
        return Err("Image is empty".to_string());
    }
    if bytes.len() > MAX_PASTED_IMAGE_SIZE {
        return Err("Image is larger than 10 MiB".to_string());
    }

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let file = workspace
        .app_root
        .join(WORKSPACE_DIR)
        .join("docs")
        .join("assets")
        .join(format!("pasted-image-{}.{}", stamp, extension));
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    fs::write(&file, bytes).map_err(|error| error.to_string())?;
    exclude_pasted_images(&workspace)?;

    Ok(FileEntry {
        name: file
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "Untitled".to_string()),
        path: relative_path(&workspace.app_root, &file)?,
        is_dir: false,
    })
}

#[tauri::command]
fn create_folder(
    workspace_id: String,
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<FileEntry, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let path = path.trim();
    if path.is_empty() {
        return Err("Folder path is required".to_string());
    }

    let folder = resolve_new_path_inside(&workspace.app_root, path)?;
    if folder.exists() {
        return Err("Folder already exists".to_string());
    }

    fs::create_dir_all(&folder).map_err(|error| error.to_string())?;

    Ok(FileEntry {
        name: folder
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "Untitled".to_string()),
        path: relative_path(&workspace.app_root, &folder)?,
        is_dir: true,
    })
}

#[tauri::command]
fn rename_path(
    workspace_id: String,
    old_path: String,
    new_name: String,
    state: State<'_, WorkspaceState>,
) -> Result<FileEntry, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let source = resolve_editable_path(&workspace, &old_path)?;
    let new_name = clean_file_name(&new_name)?;
    let parent = source
        .parent()
        .ok_or_else(|| "Path parent is invalid".to_string())?;
    let target = parent.join(new_name);

    if target.exists() {
        return Err("A file or folder with that name already exists".to_string());
    }

    fs::rename(&source, &target).map_err(|error| error.to_string())?;
    let metadata = fs::metadata(&target).map_err(|error| error.to_string())?;

    Ok(FileEntry {
        name: target
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "Untitled".to_string()),
        path: display_path(&workspace, &target)?,
        is_dir: metadata.is_dir(),
    })
}

#[tauri::command]
fn trash_path(
    workspace_id: String,
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let target = resolve_editable_path(&workspace, &path)?;
    trash::delete(&target).map_err(|error| error.to_string())
}

#[tauri::command]
fn duplicate_path(
    workspace_id: String,
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<FileEntry, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let source = resolve_editable_path(&workspace, &path)?;
    let metadata = fs::metadata(&source).map_err(|error| error.to_string())?;
    let target = duplicate_target(&source)?;

    if metadata.is_dir() {
        copy_dir_all(&source, &target)?;
    } else if metadata.is_file() {
        fs::copy(&source, &target).map_err(|error| error.to_string())?;
    } else {
        return Err("Path is not a file or folder".to_string());
    }

    Ok(FileEntry {
        name: target
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "Untitled".to_string()),
        path: display_path(&workspace, &target)?,
        is_dir: metadata.is_dir(),
    })
}

#[tauri::command]
fn reveal_path(
    workspace_id: String,
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let target = resolve_editable_path(&workspace, &path)?;

    #[cfg(target_os = "macos")]
    let status = Command::new("open")
        .arg("-R")
        .arg(&target)
        .status()
        .map_err(|error| error.to_string())?;

    #[cfg(target_os = "windows")]
    let status = Command::new("explorer")
        .arg("/select,")
        .arg(&target)
        .status()
        .map_err(|error| error.to_string())?;

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let status = Command::new("xdg-open")
        .arg(target.parent().unwrap_or(&target))
        .status()
        .map_err(|error| error.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err("Could not reveal path".to_string())
    }
}

#[tauri::command]
fn open_server_url(port: u16) -> Result<(), String> {
    let url = format!("http://localhost:{}/", port);

    #[cfg(target_os = "macos")]
    let status = Command::new("open")
        .arg(&url)
        .status()
        .map_err(|error| error.to_string())?;

    #[cfg(target_os = "windows")]
    let status = Command::new("cmd")
        .args(["/C", "start", "", &url])
        .status()
        .map_err(|error| error.to_string())?;

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let status = Command::new("xdg-open")
        .arg(&url)
        .status()
        .map_err(|error| error.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err("Could not open server URL".to_string())
    }
}

#[tauri::command]
fn list_tasks(
    workspace_id: String,
    state: State<'_, WorkspaceState>,
) -> Result<Vec<TaskItem>, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let root = workspace.app_root.join(WORKSPACE_DIR).join("tasks");
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;

    let mut tasks = Vec::new();
    for entry in fs::read_dir(&root).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            continue;
        }
        tasks.push(read_task(&workspace.app_root, &path)?);
    }

    tasks.sort_by_key(|task| task.title.to_lowercase());
    Ok(tasks)
}

#[tauri::command]
fn create_task(
    workspace_id: String,
    title: String,
    state: State<'_, WorkspaceState>,
) -> Result<TaskItem, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let title = title.trim();
    if title.is_empty() {
        return Err("Task title is required".to_string());
    }

    let root = workspace.app_root.join(WORKSPACE_DIR).join("tasks");
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let path = unique_markdown_path(&root, &slugify(title));
    let settings = editor_settings(&state)?;
    let contents = render_task_template(&settings.default_task_template, title);
    fs::write(&path, contents).map_err(|error| error.to_string())?;

    read_task(&workspace.app_root, &path)
}

#[tauri::command]
fn list_skills(
    workspace_id: String,
    state: State<'_, WorkspaceState>,
) -> Result<Vec<SkillItem>, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let root = shared_skills_root(&workspace);
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;

    let mut skills = Vec::new();
    for entry in fs::read_dir(&root).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let skill_path = path.join("SKILL.md");
        if !skill_path.is_file() {
            continue;
        }

        let slug = entry.file_name().to_string_lossy().to_string();
        let contents = fs::read_to_string(&skill_path).map_err(|error| error.to_string())?;
        let fields = parse_frontmatter(&contents);
        skills.push(SkillItem {
            name: title_from_slug(&slug),
            slug,
            path: display_path(&workspace, &skill_path)?,
            tags: parse_skill_tags(fields.get("tags")),
        });
    }

    skills.sort_by_key(|skill| skill.name.to_lowercase());
    Ok(skills)
}

#[tauri::command]
fn create_skill(
    workspace_id: String,
    name: String,
    state: State<'_, WorkspaceState>,
) -> Result<SkillItem, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let name = name.trim();
    if name.is_empty() {
        return Err("Skill name is required".to_string());
    }

    let root = shared_skills_root(&workspace);
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let slug = unique_slug(&root, &slugify(name));
    let folder = root.join(&slug);
    fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    let path = folder.join("SKILL.md");
    fs::write(
        &path,
        format!(
            "---\nname: {}\ndescription: Describe when to use this skill.\ntags:\n---\n\n# {}\n\n",
            slug, name
        ),
    )
    .map_err(|error| error.to_string())?;

    Ok(SkillItem {
        name: name.to_string(),
        slug,
        path: display_path(&workspace, &path)?,
        tags: Vec::new(),
    })
}

#[tauri::command]
fn list_docs(
    workspace_id: String,
    state: State<'_, WorkspaceState>,
) -> Result<Vec<DocItem>, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let root = workspace.app_root.join(WORKSPACE_DIR).join("docs");
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;

    let mut docs = Vec::new();
    collect_docs(&workspace.app_root, &root, &mut docs)?;
    docs.sort_by_key(|doc| doc.path.to_lowercase());
    Ok(docs)
}

#[tauri::command]
fn create_doc(
    workspace_id: String,
    title: String,
    state: State<'_, WorkspaceState>,
) -> Result<DocItem, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let title = title.trim();
    if title.is_empty() {
        return Err("Doc title is required".to_string());
    }

    let root = workspace.app_root.join(WORKSPACE_DIR).join("docs");
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let path = unique_markdown_path(&root, &slugify(title));
    fs::write(&path, format!("# {}\n\n", title)).map_err(|error| error.to_string())?;

    Ok(DocItem {
        name: title.to_string(),
        path: relative_path(&workspace.app_root, &path)?,
    })
}

#[tauri::command]
fn git_status(workspace_id: String, state: State<'_, WorkspaceState>) -> Result<GitStatus, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let files = git_files_for(&workspace)?;
    let merge_commits = merge_commits_for(&workspace)?;
    let merge_files = merge_files_for(&workspace)?;
    let develop_commits = develop_commits_for(&workspace)?;
    let develop_files = develop_files_for(&workspace)?;

    Ok(GitStatus {
        branch: workspace.branch.clone(),
        files,
        unpushed_commit_count: unpushed_commit_count(&workspace)?,
        unmerged_commit_count: merge_commits.len() as u32,
        develop_commit_count: develop_commits.len() as u32,
        merge_commits,
        merge_files,
        develop_commits,
        develop_files,
    })
}

#[tauri::command]
fn git_status_basic(
    workspace_id: String,
    state: State<'_, WorkspaceState>,
) -> Result<GitStatus, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let merge_range = format!("develop..{}", workspace.branch);
    let develop_range = format!("{}..develop", workspace.branch);

    Ok(GitStatus {
        branch: workspace.branch.clone(),
        files: git_files_for(&workspace)?,
        unpushed_commit_count: unpushed_commit_count(&workspace)?,
        unmerged_commit_count: commit_count(&workspace.worktree_root, &merge_range)?,
        develop_commit_count: commit_count(&workspace.worktree_root, &develop_range)?,
        merge_commits: Vec::new(),
        merge_files: Vec::new(),
        develop_commits: Vec::new(),
        develop_files: Vec::new(),
    })
}

#[tauri::command]
fn diff_hunks(
    workspace_id: String,
    path: String,
    status: String,
    state: State<'_, WorkspaceState>,
) -> Result<Vec<DiffHunk>, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let repo_path = repo_path_for_app_path(&workspace, &path)?;
    diff_hunks_for(&workspace.worktree_root, &repo_path, &status)
}

#[tauri::command]
fn repo_diff_hunks(
    workspace_id: String,
    path: String,
    status: String,
    state: State<'_, WorkspaceState>,
) -> Result<Vec<DiffHunk>, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let repo_path = clean_repo_path(&path)?;
    diff_hunks_for(&workspace.worktree_root, &repo_path, &status)
}

#[tauri::command]
fn merge_diff_hunks(
    workspace_id: String,
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<Vec<DiffHunk>, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let repo_path = repo_path_for_app_path(&workspace, &path)?;
    let range = format!("develop...{}", workspace.branch);
    diff_hunks_between(&workspace.worktree_root, &range, &repo_path)
}

#[tauri::command]
fn repo_merge_diff_hunks(
    workspace_id: String,
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<Vec<DiffHunk>, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let repo_path = clean_repo_path(&path)?;
    let range = format!("develop...{}", workspace.branch);
    diff_hunks_between(&workspace.worktree_root, &range, &repo_path)
}

#[tauri::command]
fn git_commit(
    workspace_id: String,
    message: String,
    state: State<'_, WorkspaceState>,
) -> Result<GitStatus, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let message = message.trim();
    if message.is_empty() {
        return Err("Commit message is required".to_string());
    }

    if git_status_lines(&workspace.worktree_root)?.is_empty() {
        return Err("No changes to commit".to_string());
    }

    run_git(&workspace.worktree_root, &["add", "-A"])?;
    run_git(&workspace.worktree_root, &["commit", "-m", message])?;
    git_status(workspace_id, state)
}

#[tauri::command]
fn git_sync(workspace_id: String, state: State<'_, WorkspaceState>) -> Result<GitStatus, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    push_workspace_branch(&workspace)?;
    git_status(workspace_id, state)
}

#[tauri::command]
fn git_merge_to_develop(
    workspace_id: String,
    state: State<'_, WorkspaceState>,
) -> Result<GitStatus, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;

    if !git_status_lines(&workspace.worktree_root)?.is_empty() {
        return Err("Commit or discard changes before merging to develop".to_string());
    }

    push_workspace_branch(&workspace)?;
    run_git(&workspace.git_root, &["checkout", "develop"])?;
    run_git(&workspace.git_root, &["pull", "origin", "develop"])?;
    run_git(
        &workspace.git_root,
        &["merge", "--no-ff", "--no-edit", &workspace.branch],
    )?;
    run_git(&workspace.git_root, &["push", "origin", "develop"])?;
    git_status(workspace_id, state)
}

#[tauri::command]
fn git_update_from_develop(
    workspace_id: String,
    state: State<'_, WorkspaceState>,
) -> Result<GitStatus, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    require_origin_remote(&workspace.worktree_root)?;

    if !git_status_lines(&workspace.worktree_root)?.is_empty() {
        return Err("Commit or discard changes before updating from develop".to_string());
    }

    run_git(&workspace.git_root, &["checkout", "develop"])?;
    run_git(&workspace.git_root, &["pull", "origin", "develop"])?;
    run_git(&workspace.worktree_root, &["merge", "--ff-only", "develop"])?;
    git_status(workspace_id, state)
}

#[tauri::command]
fn git_discard_changes(
    workspace_id: String,
    state: State<'_, WorkspaceState>,
) -> Result<GitStatus, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    run_git(
        &workspace.worktree_root,
        &["restore", "--source=HEAD", "--staged", "--worktree", "."],
    )?;
    run_git(&workspace.worktree_root, &["clean", "-fd"])?;
    git_status(workspace_id, state)
}

#[tauri::command]
fn git_discard_file(
    workspace_id: String,
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<GitStatus, String> {
    let workspace = workspace_by_id(&state, &workspace_id)?;
    let repo_path = clean_repo_path(&path)?;
    let lines = git_status_lines(&workspace.worktree_root)?;
    let line = lines
        .iter()
        .find(|line| git_status_path(line) == repo_path)
        .ok_or_else(|| "Changed file not found".to_string())?;
    discard_status_line(&workspace.worktree_root, line)?;
    git_status(workspace_id, state)
}

#[tauri::command]
fn start_terminal(
    workspace_id: String,
    terminal_id: String,
    cols: u16,
    rows: u16,
    app: AppHandle,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    if terminal_id.trim().is_empty() {
        return Err("Terminal id is required".to_string());
    }

    if state
        .terminals
        .lock()
        .map_err(|_| "Terminal state is unavailable".to_string())?
        .contains_key(&terminal_id)
    {
        return Ok(());
    }

    let workspace = workspace_by_id(&state, &workspace_id)?;
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(pty_size(cols, rows))
        .map_err(|error| error.to_string())?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| error.to_string())?;
    let mut command = CommandBuilder::new(default_shell());
    if cfg!(unix) {
        command.arg("-l");
    }
    command.cwd(workspace.app_root.as_os_str());
    command.env("PATH", default_command_path());
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    command.env("LANG", "en_US.UTF-8");
    command.env("LC_ALL", "en_US.UTF-8");
    command.env("PROMPT_EOL_MARK", "");
    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| error.to_string())?;

    let output_workspace_id = workspace_id.clone();
    let output_terminal_id = terminal_id.clone();
    thread::spawn(move || {
        let mut buffer = [0_u8; TERMINAL_OUTPUT_BUFFER_SIZE];
        let output_event = terminal_output_event(&output_terminal_id);
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => {
                    let _ = app.emit(
                        &output_event,
                        TerminalOutput {
                            workspace_id: output_workspace_id.clone(),
                            terminal_id: output_terminal_id.clone(),
                            data: buffer[..size].to_vec(),
                        },
                    );
                }
                Err(_) => break,
            }
        }
    });

    state
        .terminals
        .lock()
        .map_err(|_| "Terminal state is unavailable".to_string())?
        .insert(
            terminal_id,
            TerminalSession {
                workspace_id,
                master: pair.master,
                writer: Mutex::new(writer),
                child: Mutex::new(child),
            },
        );

    Ok(())
}

#[tauri::command]
fn write_terminal(
    terminal_id: String,
    data: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let terminals = state
        .terminals
        .lock()
        .map_err(|_| "Terminal state is unavailable".to_string())?;
    let session = terminals
        .get(&terminal_id)
        .ok_or_else(|| "Terminal is not running".to_string())?;

    let result = session
        .writer
        .lock()
        .map_err(|_| "Terminal writer is unavailable".to_string())?
        .write_all(data.as_bytes())
        .map_err(|error| error.to_string());

    result
}

#[tauri::command]
fn resize_terminal(
    terminal_id: String,
    cols: u16,
    rows: u16,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let terminals = state
        .terminals
        .lock()
        .map_err(|_| "Terminal state is unavailable".to_string())?;
    let session = terminals
        .get(&terminal_id)
        .ok_or_else(|| "Terminal is not running".to_string())?;

    session
        .master
        .resize(pty_size(cols, rows))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn kill_terminal(terminal_id: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    kill_terminal_by_id(&terminal_id, &state)
}

fn workspace_list(state: &State<'_, WorkspaceState>) -> Result<WorkspaceList, String> {
    let app_state = state
        .inner
        .lock()
        .map_err(|_| "Workspace state is unavailable".to_string())?;
    Ok(WorkspaceList {
        active_workspace_id: app_state.active_workspace_id.clone(),
        workspaces: app_state
            .workspaces
            .iter()
            .map(|workspace| WorkspaceInfo {
                id: workspace.id.clone(),
                name: workspace.name.clone(),
                app_name: workspace.app_name.clone(),
                hidden: workspace.hidden,
                is_standalone: workspace.app_relative_path.is_empty(),
                is_tauri: workspace.app_root.join("src-tauri").is_dir(),
            })
            .collect(),
    })
}

fn workspace_by_id(
    state: &State<'_, WorkspaceState>,
    workspace_id: &str,
) -> Result<WorkspaceRecord, String> {
    state
        .inner
        .lock()
        .map_err(|_| "Workspace state is unavailable".to_string())?
        .workspaces
        .iter()
        .find(|workspace| workspace.id == workspace_id)
        .cloned()
        .ok_or_else(|| "Workspace not found".to_string())
}

fn editor_settings(state: &State<'_, WorkspaceState>) -> Result<EditorSettings, String> {
    let app_state = state
        .inner
        .lock()
        .map_err(|_| "Workspace state is unavailable".to_string())?;
    Ok(app_state.editor_settings.clone())
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("workspaces.json"))
}

fn worktrees_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("worktrees");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn next_workspace_id(
    app: &AppHandle,
    state: &AppState,
    git_root: &Path,
) -> Result<(String, u32), String> {
    let mut index = state.next_workspace_index.max(1);
    loop {
        let id = format!("workspace-{}", index);
        let branch = format!("personal-ide/{}", id);
        let worktree = worktrees_dir(app)?.join(&id);

        if !state.workspaces.iter().any(|workspace| workspace.id == id)
            && !worktree.exists()
            && !git_branch_exists(git_root, &branch)
        {
            return Ok((id, index));
        }

        index += 1;
    }
}

fn workspace_index(workspace_id: &str) -> Option<u32> {
    workspace_id.strip_prefix("workspace-")?.parse().ok()
}

fn create_support_dirs(app_root: &Path) -> Result<(), String> {
    for child in ["tasks", "docs"] {
        fs::create_dir_all(app_root.join(WORKSPACE_DIR).join(child))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn validate_new_app_name(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("App name is required".to_string());
    }

    let mut chars = value.chars();
    let starts_with_safe_character = chars
        .next()
        .is_some_and(|character| character.is_ascii_lowercase() || character.is_ascii_digit());
    let has_safe_characters = chars.all(is_new_app_name_character);

    if !starts_with_safe_character || !has_safe_characters {
        return Err(NEW_APP_NAME_ALLOWED_MESSAGE.to_string());
    }

    Ok(value.to_string())
}

fn new_app_repo_target(parent_folder: &Path, app_name: &str) -> Result<(PathBuf, String), String> {
    let parent_folder = fs::canonicalize(parent_folder).map_err(|error| error.to_string())?;
    let selected_git_root = git_root_for(&parent_folder)
        .map_err(|_| "Select a folder inside a Git repo with origin.".to_string())?;
    let git_root = primary_worktree_for(&parent_folder)?;
    require_origin_remote(&git_root)?;

    let parent_relative_path = relative_path(&selected_git_root, &parent_folder)?;
    let app_relative_path = if parent_relative_path.is_empty() {
        app_name.to_string()
    } else {
        format!("{}/{}", parent_relative_path, app_name)
    };

    if parent_folder.join(app_name).exists() || git_root.join(&app_relative_path).exists() {
        return Err("An app with that folder name already exists there".to_string());
    }

    Ok((git_root, app_relative_path))
}

fn is_new_app_name_character(character: char) -> bool {
    character.is_ascii_lowercase()
        || character.is_ascii_digit()
        || character == '-'
        || character == '_'
}

fn custom_shell_scaffold_dir() -> Result<PathBuf, String> {
    let current_dir = std::env::current_dir().map_err(|error| error.to_string())?;
    find_custom_shell_scaffold_dir(&current_dir, Path::new(env!("CARGO_MANIFEST_DIR")))
}

fn find_custom_shell_scaffold_dir(
    current_root: &Path,
    manifest_root: &Path,
) -> Result<PathBuf, String> {
    for root in [current_root, manifest_root] {
        for ancestor in root.ancestors() {
            for candidate in [
                ancestor.join(CUSTOM_SHELL_APP_DIR),
                ancestor.join("apps").join(CUSTOM_SHELL_APP_DIR),
            ] {
                if candidate.join("package.json").is_file() && candidate.join("src").is_dir() {
                    return fs::canonicalize(candidate).map_err(|error| error.to_string());
                }
            }
        }
    }

    Err("Custom Shell scaffold was not found next to Personal IDE.".to_string())
}

fn copy_scaffold_dir(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|error| error.to_string())?;

    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if should_skip_scaffold_entry(&name) {
            continue;
        }

        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        let destination = target.join(entry.file_name());

        if file_type.is_dir() {
            copy_scaffold_dir(&entry.path(), &destination)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), destination).map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

fn should_skip_scaffold_entry(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | ".env"
            | ".env.local"
            | ".env.development"
            | ".env.development.local"
            | ".next"
            | ".output"
            | ".turbo"
            | "build"
            | "dist"
            | "dist-ssr"
            | "node_modules"
            | "target"
            | WORKSPACE_DIR
    )
}

fn rewrite_scaffold_metadata(
    app_root: &Path,
    app_name: &str,
    database_port: u16,
) -> Result<(), String> {
    rewrite_package_metadata(app_root, app_name)?;
    fs::write(app_root.join("vite.config.ts"), generated_vite_config())
        .map_err(|error| error.to_string())?;
    fs::write(app_root.join("README.md"), generated_readme(app_name))
        .map_err(|error| error.to_string())?;
    fs::write(app_root.join("AGENTS.md"), generated_agents_md(app_name))
        .map_err(|error| error.to_string())?;
    ensure_generated_gitignore(app_root)?;
    write_generated_env(app_root, app_name, database_port)?;
    rewrite_root_title(app_root, app_name)?;
    rewrite_login_branding(app_root, app_name)?;
    Ok(())
}

fn rewrite_package_metadata(app_root: &Path, app_name: &str) -> Result<(), String> {
    let path = app_root.join("package.json");
    let contents = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let mut package =
        serde_json::from_str::<serde_json::Value>(&contents).map_err(|error| error.to_string())?;

    let Some(object) = package.as_object_mut() else {
        return Err("Scaffold package.json must be a JSON object".to_string());
    };

    object.insert(
        "name".to_string(),
        serde_json::Value::String(app_name.to_string()),
    );
    let scripts = object
        .entry("scripts".to_string())
        .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
    let Some(scripts) = scripts.as_object_mut() else {
        return Err("Scaffold package.json scripts must be a JSON object".to_string());
    };
    scripts.insert(
        "db:setup".to_string(),
        serde_json::Value::String(format!("node {DATABASE_SETUP_SCRIPT}")),
    );
    scripts.insert(
        "predev".to_string(),
        serde_json::Value::String("npm run db:setup".to_string()),
    );

    let contents = serde_json::to_string_pretty(&package).map_err(|error| error.to_string())?;
    fs::write(path, format!("{}\n", contents)).map_err(|error| error.to_string())
}

fn write_generated_env(app_root: &Path, app_name: &str, database_port: u16) -> Result<(), String> {
    fs::write(
        app_root.join(".env.local"),
        format!(
            "# Generated by Personal IDE.\nCUSTOM_SHELL_APP_ORIGINS=\"http://127.0.0.1:3000,http://localhost:3000\"\nCUSTOM_SHELL_POSTGRES_PORT=\"{database_port}\"\nCUSTOM_SHELL_DATABASE_URL=\"postgresql://postgres:localdev@localhost:{database_port}/{app_name}\"\n"
        ),
    )
    .map_err(|error| error.to_string())
}

fn used_generated_database_ports(
    state: &State<'_, WorkspaceState>,
) -> Result<HashSet<u16>, String> {
    let app_roots = {
        let app_state = state
            .inner
            .lock()
            .map_err(|_| "Workspace state is unavailable".to_string())?;
        app_state
            .workspaces
            .iter()
            .map(|workspace| workspace.app_root.clone())
            .collect::<Vec<_>>()
    };

    let mut ports = HashSet::new();
    for app_root in app_roots {
        if let Some(port) = read_generated_database_port(&app_root)? {
            ports.insert(port);
        }
    }

    Ok(ports)
}

fn read_generated_database_port(app_root: &Path) -> Result<Option<u16>, String> {
    let env_path = app_root.join(".env.local");
    if !env_path.is_file() {
        return Ok(None);
    }

    let contents = fs::read_to_string(env_path).map_err(|error| error.to_string())?;
    generated_database_port_from_env(&contents)
}

fn generated_database_port_from_env(contents: &str) -> Result<Option<u16>, String> {
    for line in contents.lines() {
        let line = line.trim();
        let Some(value) = line.strip_prefix("CUSTOM_SHELL_POSTGRES_PORT=") else {
            continue;
        };
        let port = value
            .trim()
            .trim_matches(['"', '\''])
            .parse::<u16>()
            .map_err(|_| {
                "Generated app .env.local has an invalid CUSTOM_SHELL_POSTGRES_PORT.".to_string()
            })?;
        return Ok(Some(port));
    }

    Ok(None)
}

fn generated_database_port(app_name: &str, used_ports: &HashSet<u16>) -> Result<u16, String> {
    let hash = app_name.bytes().fold(0_u32, |hash, byte| {
        hash.wrapping_mul(31).wrapping_add(byte as u32)
    });
    let base_offset = hash % 1_000;

    for offset in 0..1_000 {
        let candidate = 54_000 + ((base_offset + offset) % 1_000) as u16;
        if !used_ports.contains(&candidate) {
            return Ok(candidate);
        }
    }

    Err("No generated database ports are available.".to_string())
}

fn generated_vite_config() -> &'static str {
    r#"import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

// https://vite.dev/config/
export default defineConfig({
  plugins: [tanstackStart(), nitro(), react(), tailwindcss(), tsconfigPaths()],
  resolve: {
    alias: [
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
    ],
  },
  server: {
    port: 3000,
  },
})
"#
}

fn generated_readme(app_name: &str) -> String {
    let title = title_from_slug(app_name);
    format!(
        "# {title}\n\nGenerated from the Custom Shell scaffold.\n\n## Development\n\n```bash\nnpm install\nnpm run dev\n```\n\nThe local app runs at `http://localhost:3000` by default.\n"
    )
}

fn generated_agents_md(app_name: &str) -> String {
    let title = title_from_slug(app_name);
    format!(
        "# AGENTS.md\n\nGuidance for agents working in {title}.\n\n## App Context\n\nThis app was generated from the Custom Shell scaffold. Use local code and docs as the source of truth.\n\n## Working Rules\n\n- Keep changes small and direct.\n- Do not commit secrets.\n- Run the narrowest relevant checks before summarizing work.\n"
    )
}

fn ensure_generated_gitignore(app_root: &Path) -> Result<(), String> {
    let path = app_root.join(".gitignore");
    let mut contents = if path.is_file() {
        fs::read_to_string(&path).map_err(|error| error.to_string())?
    } else {
        String::new()
    };

    for entry in [".env", ".env.*", "!.env.example"] {
        if !contents.lines().any(|line| line.trim() == entry) {
            if !contents.ends_with('\n') && !contents.is_empty() {
                contents.push('\n');
            }
            contents.push_str(entry);
            contents.push('\n');
        }
    }

    fs::write(path, contents).map_err(|error| error.to_string())
}

fn rewrite_root_title(app_root: &Path, app_name: &str) -> Result<(), String> {
    let path = app_root.join("src/routes/__root.tsx");
    if !path.is_file() {
        return Ok(());
    }

    let contents = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let contents = contents.replace(
        r#"{ title: "custom-shell" }"#,
        &format!(r#"{{ title: "{}" }}"#, app_name),
    );
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn rewrite_login_branding(app_root: &Path, app_name: &str) -> Result<(), String> {
    let path = app_root.join("src/routes/login.tsx");
    if !path.is_file() {
        return Ok(());
    }

    let title = title_from_slug(app_name);
    let contents = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let contents = contents
        .replace("Sign in to Custom Shell", &format!("Sign in to {title}"))
        .replace(
            "Use your Custom Shell account.",
            &format!("Use your {title} account."),
        );
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn copy_local_env_files(source_app: &Path, target_app: &Path) -> Result<(), String> {
    for name in [
        ".env",
        ".env.local",
        ".env.development",
        ".env.development.local",
    ] {
        let source = source_app.join(name);
        if source.is_file() {
            fs::copy(&source, target_app.join(name)).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn read_text_file_at(root: &Path, relative_path: &str) -> Result<String, String> {
    let file = resolve_inside(root, Some(relative_path))?;
    read_text_file_path(&file)
}

fn read_text_file_path(file: &Path) -> Result<String, String> {
    let metadata = fs::metadata(file).map_err(|error| error.to_string())?;

    if !metadata.is_file() {
        return Err("Path is not a file".to_string());
    }

    if metadata.len() > MAX_FILE_SIZE {
        return Err("File is larger than 1 MiB".to_string());
    }

    let bytes = fs::read(file).map_err(|error| error.to_string())?;

    if bytes.contains(&0) {
        return Err("Binary files are not supported".to_string());
    }

    String::from_utf8(bytes).map_err(|_| "Binary files are not supported".to_string())
}

fn shared_skills_root(workspace: &WorkspaceRecord) -> PathBuf {
    workspace.worktree_root.join(SHARED_SKILLS_DIR)
}

fn is_shared_skill_path(path: &str) -> bool {
    path == SHARED_SKILLS_DIR || path.starts_with(&format!("{}/", SHARED_SKILLS_DIR))
}

fn resolve_editable_path(workspace: &WorkspaceRecord, path: &str) -> Result<PathBuf, String> {
    let path = path.trim().replace('\\', "/");
    if is_shared_skill_path(&path) {
        return resolve_inside(&workspace.worktree_root, Some(&path));
    }

    resolve_inside(&workspace.app_root, Some(&path))
}

fn display_path(workspace: &WorkspaceRecord, path: &Path) -> Result<String, String> {
    let skills_root = shared_skills_root(workspace);
    if path.starts_with(&skills_root) {
        return relative_path(&workspace.worktree_root, path);
    }

    relative_path(&workspace.app_root, path)
}

fn resolve_inside(root: &Path, relative: Option<&str>) -> Result<PathBuf, String> {
    let root = fs::canonicalize(root).map_err(|error| error.to_string())?;
    let relative = relative.unwrap_or_default();
    let path = if relative.is_empty() {
        root.clone()
    } else {
        let relative_path = Path::new(relative);

        if relative_path.is_absolute()
            || relative_path
                .components()
                .any(|component| matches!(component, Component::ParentDir))
        {
            return Err("Path must stay inside the workspace".to_string());
        }

        root.join(relative_path)
    };

    let canonical = fs::canonicalize(path).map_err(|error| error.to_string())?;
    if !canonical.starts_with(&root) {
        return Err("Path must stay inside the workspace".to_string());
    }

    Ok(canonical)
}

fn resolve_new_path_inside(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(root).map_err(|error| error.to_string())?;
    let relative_path = Path::new(relative);

    if relative_path.is_absolute()
        || relative_path
            .components()
            .any(|component| matches!(component, Component::ParentDir))
    {
        return Err("Path must stay inside the workspace".to_string());
    }

    let target = root.join(relative_path);
    let mut existing = target
        .parent()
        .ok_or_else(|| "Path parent is invalid".to_string())?;
    while !existing.exists() {
        existing = existing
            .parent()
            .ok_or_else(|| "Path parent is invalid".to_string())?;
    }

    let existing = fs::canonicalize(existing).map_err(|error| error.to_string())?;
    if !existing.starts_with(&root) {
        return Err("Path must stay inside the workspace".to_string());
    }

    Ok(target)
}

fn clean_file_name(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("Name is required".to_string());
    }

    let mut components = Path::new(value).components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(_)), None) => Ok(value.to_string()),
        _ => Err("Name cannot contain folders".to_string()),
    }
}

fn duplicate_target(source: &Path) -> Result<PathBuf, String> {
    let parent = source
        .parent()
        .ok_or_else(|| "Path parent is invalid".to_string())?;
    let stem = source
        .file_stem()
        .map(|name| name.to_string_lossy().to_string())
        .or_else(|| {
            source
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
        })
        .unwrap_or_else(|| "copy".to_string());
    let extension = source
        .extension()
        .map(|ext| ext.to_string_lossy().to_string());

    for index in 1..1000 {
        let suffix = if index == 1 {
            " copy".to_string()
        } else {
            format!(" copy {}", index)
        };
        let file_name = match &extension {
            Some(extension) => format!("{}{}.{}", stem, suffix, extension),
            None => format!("{}{}", stem, suffix),
        };
        let candidate = parent.join(file_name);
        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("Could not choose duplicate name".to_string())
}

fn copy_dir_all(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|error| error.to_string())?;

    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        let destination = target.join(entry.file_name());

        if file_type.is_dir() {
            copy_dir_all(&entry.path(), &destination)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), destination).map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

fn relative_path(root: &Path, path: &Path) -> Result<String, String> {
    let relative = path.strip_prefix(root).map_err(|error| error.to_string())?;

    Ok(relative
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/"))
}

fn exclude_pasted_images(workspace: &WorkspaceRecord) -> Result<(), String> {
    let prefix = if workspace.app_relative_path.is_empty() {
        String::new()
    } else {
        format!("{}/", workspace.app_relative_path)
    };
    let pattern = format!("{}workspace/docs/assets/pasted-image-*", prefix);
    let exclude = run_git(
        &workspace.git_root,
        &["rev-parse", "--git-path", "info/exclude"],
    )?;
    let path = PathBuf::from(exclude.trim());
    let exclude_path = if path.is_absolute() {
        path
    } else {
        workspace.git_root.join(path)
    };
    let mut contents = fs::read_to_string(&exclude_path).unwrap_or_default();
    if contents.lines().any(|line| line.trim() == pattern) {
        return Ok(());
    }
    if let Some(parent) = exclude_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    if !contents.is_empty() && !contents.ends_with('\n') {
        contents.push('\n');
    }
    contents.push_str(&pattern);
    contents.push('\n');
    fs::write(exclude_path, contents).map_err(|error| error.to_string())
}

fn read_task(app_root: &Path, path: &Path) -> Result<TaskItem, String> {
    let contents = read_text_file_at(app_root, &relative_path(app_root, path)?)?;
    let fields = parse_frontmatter(&contents);
    let title = title_from_slug(
        path.file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .as_ref(),
    );
    let raw_status = fields
        .get("status")
        .cloned()
        .unwrap_or_else(|| "active".to_string());
    let (status, error) = normalize_task_status(raw_status);

    Ok(TaskItem {
        title,
        path: relative_path(app_root, path)?,
        status,
        skill: fields.get("skill").cloned(),
        error,
    })
}

fn normalize_task_status(raw_status: String) -> (String, Option<String>) {
    let status = raw_status
        .trim()
        .to_lowercase()
        .chars()
        .map(|character| match character {
            ' ' | '-' => '_',
            _ => character,
        })
        .collect::<String>();

    match status.as_str() {
        "" => ("active".to_string(), None),
        "complete" | "completed" => ("done".to_string(), None),
        _ => (status, None),
    }
}

fn parse_frontmatter(contents: &str) -> HashMap<String, String> {
    let mut fields = HashMap::new();
    let Some((start, end, _)) = frontmatter_bounds(contents) else {
        return fields;
    };

    for line in contents[start..end].lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        fields.insert(
            key.trim().to_string(),
            value.trim().trim_matches('"').to_string(),
        );
    }

    fields
}

fn parse_skill_tags(value: Option<&String>) -> Vec<String> {
    let Some(value) = value else {
        return Vec::new();
    };
    let value = value.trim().trim_start_matches('[').trim_end_matches(']');
    let mut tags = Vec::new();

    for item in value.split(',') {
        let tag = item
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .to_lowercase();
        if tag.is_empty() || tags.iter().any(|existing| existing == &tag) {
            continue;
        }
        tags.push(tag);
    }

    tags
}

fn default_task_template() -> String {
    DEFAULT_TASK_TEMPLATE.to_string()
}

fn render_task_template(template: &str, title: &str) -> String {
    let mut contents = template.replace("{{title}}", title);
    if !contents.is_empty() && !contents.ends_with('\n') {
        contents.push('\n');
    }
    contents
}

fn validate_editor_settings(settings: &EditorSettings) -> Result<(), String> {
    if settings.default_task_template.len() > MAX_TASK_TEMPLATE_SIZE {
        return Err(format!(
            "Default task template must be {} KB or smaller",
            MAX_TASK_TEMPLATE_SIZE / 1024
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        clean_repo_path, cleanup_created_worktree, delete_workspace_branch,
        ensure_workspace_branch_can_be_deleted, find_custom_shell_scaffold_dir,
        generated_database_port, generated_database_port_from_env, git_branch_exists,
        has_origin_remote, new_app_repo_target, normalize_task_status, parse_diff_hunk,
        parse_skill_tags, path_arg, primary_worktree_for, push_workspace_branch,
        read_git_repo_text_file, render_task_template, rewrite_scaffold_metadata,
        should_skip_scaffold_entry, validate_editor_settings, validate_new_app_name, DiffHunk,
        EditorSettings, WorkspaceRecord, DEFAULT_TASK_TEMPLATE, MAX_TASK_TEMPLATE_SIZE,
    };
    use std::{
        collections::HashSet,
        fs,
        path::{Path, PathBuf},
        process::Command,
        time::{SystemTime, UNIX_EPOCH},
    };

    const WORKSPACE_10_BRANCH: &str = "personal-ide/workspace-10";

    fn temp_path(label: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("personal-ide-{label}-test-{unique}"))
    }

    fn run_test_git(root: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(args)
            .current_dir(root)
            .status()
            .expect("run git command");
        assert!(status.success(), "git {:?} failed", args);
    }

    fn init_test_repo(root: &Path) {
        fs::create_dir_all(root).expect("create repo");
        fs::write(root.join("README.md"), "# Test\n").expect("write readme");
        run_test_git(root, &["init", "-q"]);
        run_test_git(root, &["config", "user.email", "test@example.local"]);
        run_test_git(root, &["config", "user.name", "Test"]);
        run_test_git(root, &["checkout", "-q", "-b", "develop"]);
        run_test_git(root, &["add", "."]);
        run_test_git(root, &["commit", "-q", "-m", "initial"]);
    }

    fn test_workspace(root: &Path, id: &str, branch: &str) -> WorkspaceRecord {
        WorkspaceRecord {
            id: id.to_string(),
            name: id.to_string(),
            app_name: "sample-app".to_string(),
            hidden: false,
            branch: branch.to_string(),
            git_root: root.to_path_buf(),
            worktree_root: root.to_path_buf(),
            app_root: root.to_path_buf(),
            app_relative_path: String::new(),
        }
    }

    #[test]
    fn parse_skill_tags_normalizes_and_deduplicates() {
        let tags = "Define, plan, \"review\", define".to_string();

        assert_eq!(
            parse_skill_tags(Some(&tags)),
            vec!["define", "plan", "review"]
        );
    }

    #[test]
    fn editor_settings_default_uses_active_task_frontmatter() {
        assert_eq!(
            EditorSettings::default().default_task_template,
            DEFAULT_TASK_TEMPLATE
        );
    }

    #[test]
    fn render_task_template_replaces_title_placeholder() {
        let template = "# {{title}}\n\nNotes";

        assert_eq!(
            render_task_template(template, "Add settings"),
            "# Add settings\n\nNotes\n"
        );
    }

    #[test]
    fn render_task_template_preserves_empty_template() {
        assert_eq!(render_task_template("", "Add settings"), "");
    }

    #[test]
    fn normalize_task_status_maps_completed_to_done() {
        assert_eq!(
            normalize_task_status("completed".to_string()),
            ("done".to_string(), None)
        );
    }

    #[test]
    fn normalize_task_status_accepts_dynamic_statuses() {
        assert_eq!(
            normalize_task_status("In Progress".to_string()),
            ("in_progress".to_string(), None)
        );
        assert_eq!(
            normalize_task_status("blocked".to_string()),
            ("blocked".to_string(), None)
        );
    }

    #[test]
    fn validate_editor_settings_rejects_oversized_task_template() {
        let settings = EditorSettings {
            default_task_template: "x".repeat(MAX_TASK_TEMPLATE_SIZE + 1),
        };

        assert!(validate_editor_settings(&settings).is_err());
    }

    #[test]
    fn validate_new_app_name_accepts_safe_folder_names() {
        assert_eq!(validate_new_app_name("new-admin").unwrap(), "new-admin");
        assert_eq!(validate_new_app_name("crm_2").unwrap(), "crm_2");
    }

    #[test]
    fn validate_new_app_name_rejects_path_like_names() {
        assert!(validate_new_app_name("../admin").is_err());
        assert!(validate_new_app_name("admin app").is_err());
        assert!(validate_new_app_name(".hidden").is_err());
    }

    #[test]
    fn scaffold_copy_skips_local_and_generated_entries() {
        assert!(should_skip_scaffold_entry("node_modules"));
        assert!(should_skip_scaffold_entry(".env.local"));
        assert!(should_skip_scaffold_entry("workspace"));
        assert!(!should_skip_scaffold_entry(".env.example"));
        assert!(!should_skip_scaffold_entry("src"));
    }

    #[test]
    fn scaffold_lookup_uses_manifest_root_when_current_dir_is_outside_repo() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("personal-ide-scaffold-test-{unique}"));
        let manifest_root = root.join("apps/personal-ide/src-tauri");
        let scaffold_root = root.join("apps/custom-shell");
        let outside_root = std::env::temp_dir().join(format!("personal-ide-outside-test-{unique}"));

        fs::create_dir_all(&manifest_root).expect("create manifest dir");
        fs::create_dir_all(scaffold_root.join("src")).expect("create scaffold src");
        fs::create_dir_all(&outside_root).expect("create outside dir");
        fs::write(scaffold_root.join("package.json"), "{}\n").expect("write package");

        assert_eq!(
            find_custom_shell_scaffold_dir(&outside_root, &manifest_root).unwrap(),
            fs::canonicalize(scaffold_root).expect("canonicalize scaffold")
        );

        fs::remove_dir_all(root).expect("remove temp scaffold test");
        fs::remove_dir_all(outside_root).expect("remove temp outside test");
    }

    #[test]
    fn scaffold_metadata_generates_app_env_and_branding() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("personal-ide-db-scaffold-test-{unique}"));
        fs::create_dir_all(root.join("src/routes")).expect("create app routes");
        fs::write(
            root.join("package.json"),
            r#"{"name":"custom-shell","scripts":{"dev":"vite dev"}}"#,
        )
        .expect("write package");
        fs::write(
            root.join("src/routes/__root.tsx"),
            r#"{ title: "custom-shell" }"#,
        )
        .expect("write root route");
        fs::write(
            root.join("src/routes/login.tsx"),
            r#"<h1>Sign in to Custom Shell</h1><p>Use your Custom Shell account.</p>"#,
        )
        .expect("write login route");
        rewrite_scaffold_metadata(&root, "sample-app", 54_123).expect("rewrite scaffold metadata");

        let package = fs::read_to_string(root.join("package.json")).expect("read package");
        let package: serde_json::Value = serde_json::from_str(&package).expect("parse package");
        assert_eq!(
            package["scripts"]["db:setup"],
            "node scripts/setup-database.mjs"
        );
        assert_eq!(package["scripts"]["predev"], "npm run db:setup");

        let env = fs::read_to_string(root.join(".env.local")).expect("read env");
        assert!(env.contains("CUSTOM_SHELL_APP_ORIGINS"));
        assert!(env.contains("http://127.0.0.1:3000,http://localhost:3000"));
        assert!(env.contains("CUSTOM_SHELL_DATABASE_URL"));
        assert!(env.contains("CUSTOM_SHELL_POSTGRES_PORT=\"54123\""));
        assert!(!env.contains("custom_shell_"));

        let login = fs::read_to_string(root.join("src/routes/login.tsx")).expect("read login");
        assert!(login.contains("Sign in to Sample App"));
        assert!(login.contains("Use your Sample App account."));
        assert!(!login.contains("Custom Shell account"));

        fs::remove_dir_all(root).expect("remove temp scaffold metadata test");
    }

    #[test]
    fn sync_requires_origin_remote() {
        let root = temp_path("no-origin");
        init_test_repo(&root);
        run_test_git(&root, &["checkout", "-q", "-b", "personal-ide/workspace-1"]);
        let workspace = test_workspace(&root, "workspace-1", "personal-ide/workspace-1");

        assert!(!has_origin_remote(&root));
        assert_eq!(
            push_workspace_branch(&workspace).unwrap_err(),
            "No remote named origin is configured for this workspace."
        );

        fs::remove_dir_all(root).expect("remove temp repo");
    }

    #[test]
    fn new_app_target_requires_origin_remote() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("personal-ide-new-app-target-test-{unique}"));
        let apps = root.join("apps");
        fs::create_dir_all(&apps).expect("create apps dir");

        run_test_git(&root, &["init", "-q"]);

        assert!(!has_origin_remote(&root));
        assert_eq!(
            new_app_repo_target(&apps, "seo").unwrap_err(),
            "No remote named origin is configured for this workspace."
        );

        fs::remove_dir_all(root).expect("remove temp repo");
    }

    #[test]
    fn new_app_target_uses_primary_worktree_and_relative_app_path() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("personal-ide-primary-root-test-{unique}"));
        let bare = std::env::temp_dir().join(format!("personal-ide-origin-test-{unique}.git"));
        let linked = std::env::temp_dir().join(format!("personal-ide-linked-root-test-{unique}"));
        fs::create_dir_all(root.join("apps")).expect("create apps dir");

        run_test_git(&root, &["init", "-q"]);
        run_test_git(&root, &["config", "user.email", "test@example.local"]);
        run_test_git(&root, &["config", "user.name", "Test"]);
        run_test_git(&root, &["checkout", "-q", "-b", "develop"]);
        fs::write(root.join("README.md"), "# Test\n").expect("write readme");
        fs::write(root.join("apps/.gitkeep"), "").expect("write apps marker");
        run_test_git(&root, &["add", "."]);
        run_test_git(&root, &["commit", "-q", "-m", "initial"]);
        run_test_git(&root, &["init", "--bare", "-q", path_arg(&bare).as_str()]);
        run_test_git(
            &root,
            &["remote", "add", "origin", path_arg(&bare).as_str()],
        );
        assert!(has_origin_remote(&root));
        run_test_git(
            &root,
            &[
                "worktree",
                "add",
                "-b",
                "personal-ide/test",
                path_arg(&linked).as_str(),
                "HEAD",
            ],
        );

        assert_eq!(
            primary_worktree_for(&linked).expect("primary worktree"),
            fs::canonicalize(&root).expect("canonical root")
        );

        let (git_root, app_relative_path) =
            new_app_repo_target(&linked.join("apps"), "seo").expect("new app target");
        assert_eq!(git_root, fs::canonicalize(&root).expect("canonical root"));
        assert_eq!(app_relative_path, "apps/seo");

        run_test_git(&root, &["worktree", "remove", path_arg(&linked).as_str()]);
        fs::remove_dir_all(root).expect("remove temp primary root");
        fs::remove_dir_all(bare).expect("remove temp origin");
    }

    #[test]
    fn generated_database_port_skips_used_ports() {
        let used_ports = HashSet::new();
        let first = generated_database_port("sample-app", &used_ports).expect("first port");
        let mut used_ports = HashSet::new();
        used_ports.insert(first);

        let second = generated_database_port("sample-app", &used_ports).expect("second port");

        assert_ne!(first, second);
        assert!((54_000..55_000).contains(&second));
        assert_eq!(
            generated_database_port_from_env("CUSTOM_SHELL_POSTGRES_PORT=\"54123\"\n"),
            Ok(Some(54_123))
        );
        assert!(
            generated_database_port_from_env("CUSTOM_SHELL_POSTGRES_PORT=\"not-a-port\"\n")
                .is_err()
        );
    }

    #[test]
    fn delete_workspace_branch_removes_local_branch() {
        let root = temp_path("delete-branch");
        init_test_repo(&root);
        run_test_git(&root, &["branch", WORKSPACE_10_BRANCH]);

        assert!(git_branch_exists(&root, WORKSPACE_10_BRANCH));
        delete_workspace_branch(&root, WORKSPACE_10_BRANCH).expect("delete branch");
        assert!(!git_branch_exists(&root, WORKSPACE_10_BRANCH));

        fs::remove_dir_all(root).expect("remove temp repo");
    }

    #[test]
    fn delete_workspace_rejects_unpushed_commits() {
        let root = temp_path("unpushed-delete");
        init_test_repo(&root);
        run_test_git(&root, &["checkout", "-q", "-b", WORKSPACE_10_BRANCH]);
        fs::write(root.join("README.md"), "# Changed\n").expect("write change");
        run_test_git(&root, &["add", "."]);
        run_test_git(&root, &["commit", "-q", "-m", "workspace change"]);
        let workspace = test_workspace(&root, "workspace-10", WORKSPACE_10_BRANCH);

        assert_eq!(
            ensure_workspace_branch_can_be_deleted(&workspace).unwrap_err(),
            "Workspace has unpushed commits. Sync or merge them before deleting."
        );

        fs::remove_dir_all(root).expect("remove temp repo");
    }

    #[test]
    fn failed_workspace_setup_cleanup_removes_worktree_and_branch() {
        let root = temp_path("cleanup-root");
        let linked = temp_path("cleanup-worktree");
        init_test_repo(&root);
        run_test_git(
            &root,
            &[
                "worktree",
                "add",
                "-b",
                WORKSPACE_10_BRANCH,
                path_arg(&linked).as_str(),
                "HEAD",
            ],
        );

        assert!(linked.exists());
        assert!(git_branch_exists(&root, WORKSPACE_10_BRANCH));
        cleanup_created_worktree(&root, &linked, WORKSPACE_10_BRANCH).expect("cleanup worktree");
        assert!(!linked.exists());
        assert!(!git_branch_exists(&root, WORKSPACE_10_BRANCH));

        fs::remove_dir_all(root).expect("remove temp repo");
    }

    #[test]
    fn parses_diff_hunk_with_explicit_counts() {
        assert_eq!(
            parse_diff_hunk("@@ -4038,2 +4041,18 @@ function EditorPanel({"),
            Some(DiffHunk {
                original_start: 4038,
                original_count: 2,
                current_start: 4041,
                current_count: 18,
            })
        );
    }

    #[test]
    fn parses_diff_hunk_with_zero_count_insertion() {
        assert_eq!(
            parse_diff_hunk("@@ -0,0 +1,3 @@"),
            Some(DiffHunk {
                original_start: 0,
                original_count: 0,
                current_start: 1,
                current_count: 3,
            })
        );
    }

    #[test]
    fn clean_repo_path_rejects_backslash_parent_segments() {
        assert!(clean_repo_path("..\\local-apps.json").is_err());
    }

    #[test]
    fn reads_original_repo_root_file_for_app_workspace() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("personal-ide-git-test-{unique}"));
        fs::create_dir_all(root.join("apps/personal-ide")).expect("create app dir");
        fs::write(root.join("local-apps.json"), "{\"personal-ide\":3006}\n")
            .expect("write repo file");

        run_test_git(&root, &["init", "-q"]);
        run_test_git(&root, &["config", "user.email", "test@example.com"]);
        run_test_git(&root, &["config", "user.name", "Test User"]);
        run_test_git(&root, &["add", "local-apps.json"]);
        run_test_git(&root, &["commit", "-q", "-m", "add local apps"]);

        let workspace = WorkspaceRecord {
            id: "workspace-1".to_string(),
            name: "workspace-1".to_string(),
            app_name: "personal-ide".to_string(),
            hidden: false,
            branch: "personal-ide/workspace-1".to_string(),
            git_root: root.clone(),
            worktree_root: root.clone(),
            app_root: root.join("apps/personal-ide"),
            app_relative_path: "apps/personal-ide".to_string(),
        };

        assert_eq!(
            read_git_repo_text_file(&workspace, "local-apps.json", "HEAD").unwrap(),
            "{\"personal-ide\":3006}\n"
        );

        fs::remove_dir_all(root).expect("remove temp repo");
    }
}

fn frontmatter_bounds(contents: &str) -> Option<(usize, usize, usize)> {
    let start = if contents.starts_with("---\r\n") {
        5
    } else if contents.starts_with("---\n") {
        4
    } else {
        return None;
    };

    let rest = &contents[start..];
    let marker_index = rest.find("\n---")?;
    let end = start + marker_index;
    let close_start = end;
    let mut after = close_start + "\n---".len();
    if contents[after..].starts_with("\r\n") {
        after += 2;
    } else if contents[after..].starts_with('\n') {
        after += 1;
    }
    Some((start, end, after))
}

fn collect_docs(app_root: &Path, folder: &Path, docs: &mut Vec<DocItem>) -> Result<(), String> {
    for entry in fs::read_dir(folder).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            let relative = relative_path(app_root, &path)?;
            let assets_root = format!("{}/docs/assets", WORKSPACE_DIR);
            if relative == assets_root || relative.starts_with(&format!("{}/", assets_root)) {
                continue;
            }
            collect_docs(app_root, &path, docs)?;
        } else if path.extension().and_then(|ext| ext.to_str()) == Some("md") {
            docs.push(DocItem {
                name: path
                    .file_stem()
                    .map(|name| title_from_slug(name.to_string_lossy().as_ref()))
                    .unwrap_or_else(|| "Doc".to_string()),
                path: relative_path(app_root, &path)?,
            });
        }
    }
    Ok(())
}

fn unique_markdown_path(folder: &Path, slug: &str) -> PathBuf {
    let base = if slug.is_empty() { "task" } else { slug };
    let mut path = folder.join(format!("{}.md", base));
    let mut index = 2;

    while path.exists() {
        path = folder.join(format!("{}-{}.md", base, index));
        index += 1;
    }

    path
}

fn unique_slug(folder: &Path, slug: &str) -> String {
    let base = if slug.is_empty() { "item" } else { slug };
    let mut candidate = base.to_string();
    let mut index = 2;

    while folder.join(&candidate).exists() {
        candidate = format!("{}-{}", base, index);
        index += 1;
    }

    candidate
}

fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;

    for character in value.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_alphanumeric() {
            slug.push(character);
            last_dash = false;
        } else if !last_dash {
            slug.push('-');
            last_dash = true;
        }
    }

    slug.trim_matches('-').to_string()
}

fn title_from_slug(value: &str) -> String {
    value
        .split(['-', '_'])
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn git_root_for(path: &Path) -> Result<PathBuf, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(path)
        .args(["rev-parse", "--show-toplevel"])
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(command_error("git rev-parse", &output));
    }

    let root = String::from_utf8(output.stdout).map_err(|error| error.to_string())?;
    fs::canonicalize(root.trim()).map_err(|error| error.to_string())
}

fn primary_worktree_for(path: &Path) -> Result<PathBuf, String> {
    let output = run_git(path, &["worktree", "list", "--porcelain"])?;

    for line in output.lines() {
        if let Some(root) = line.strip_prefix("worktree ") {
            return fs::canonicalize(root).map_err(|error| error.to_string());
        }
    }

    git_root_for(path)
}

fn git_branch_exists(git_root: &Path, branch: &str) -> bool {
    Command::new("git")
        .arg("-C")
        .arg(git_root)
        .args(["show-ref", "--verify", "--quiet"])
        .arg(format!("refs/heads/{}", branch))
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn git_ref_exists(root: &Path, reference: &str) -> bool {
    Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["show-ref", "--verify", "--quiet"])
        .arg(reference)
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn git_status_lines(root: &Path) -> Result<Vec<String>, String> {
    let output = run_git(root, &["status", "--short", "--untracked-files=all"])?;
    Ok(output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| line.to_string())
        .collect())
}

fn git_status_path(line: &str) -> String {
    let path = line.chars().skip(3).collect::<String>();
    path.split(" -> ")
        .last()
        .unwrap_or(path.as_str())
        .to_string()
}

fn git_files_for(workspace: &WorkspaceRecord) -> Result<Vec<GitFile>, String> {
    git_status_lines(&workspace.worktree_root)?
        .into_iter()
        .map(|line| {
            let status = line.chars().take(2).collect::<String>().trim().to_string();
            let path = git_status_path(&line);
            let app_path = app_relative_status_path(workspace, &path);

            Ok(GitFile {
                status,
                path,
                app_path,
            })
        })
        .collect::<Result<Vec<_>, String>>()
}

fn unpushed_commit_count(workspace: &WorkspaceRecord) -> Result<u32, String> {
    let root = if workspace.worktree_root.exists() {
        &workspace.worktree_root
    } else {
        &workspace.git_root
    };
    let remote_ref = format!("refs/remotes/origin/{}", workspace.branch);
    let base = if git_ref_exists(root, &remote_ref) {
        format!("origin/{}", workspace.branch)
    } else {
        "develop".to_string()
    };

    commit_count(root, &format!("{}..{}", base, workspace.branch))
}

fn ensure_workspace_branch_can_be_deleted(workspace: &WorkspaceRecord) -> Result<(), String> {
    if !git_branch_exists(&workspace.git_root, &workspace.branch) {
        return Ok(());
    }

    if unpushed_commit_count(workspace)? == 0 {
        return Ok(());
    }

    Err("Workspace has unpushed commits. Sync or merge them before deleting.".to_string())
}

fn cleanup_created_worktree(
    git_root: &Path,
    worktree_root: &Path,
    branch: &str,
) -> Result<(), String> {
    if worktree_root.exists() {
        run_git(
            git_root,
            &[
                "worktree",
                "remove",
                "--force",
                path_arg(worktree_root).as_str(),
            ],
        )?;
    }

    delete_workspace_branch(git_root, branch)
}

fn delete_workspace_branch(git_root: &Path, branch: &str) -> Result<(), String> {
    if !git_branch_exists(git_root, branch) {
        return Ok(());
    }

    run_git(git_root, &["branch", "-D", branch]).map(|_| ())
}

fn push_workspace_branch(workspace: &WorkspaceRecord) -> Result<(), String> {
    require_origin_remote(&workspace.worktree_root)?;
    run_git(
        &workspace.worktree_root,
        &["push", "-u", "origin", &workspace.branch],
    )?;
    run_git(
        &workspace.worktree_root,
        &[
            "update-ref",
            &format!("refs/remotes/origin/{}", workspace.branch),
            &workspace.branch,
        ],
    )
    .map(|_| ())
}

fn require_origin_remote(root: &Path) -> Result<(), String> {
    if has_origin_remote(root) {
        return Ok(());
    }

    Err("No remote named origin is configured for this workspace.".to_string())
}

fn has_origin_remote(root: &Path) -> bool {
    Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["remote", "get-url", "origin"])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn merge_commits_for(workspace: &WorkspaceRecord) -> Result<Vec<GitCommit>, String> {
    let output = run_git(
        &workspace.worktree_root,
        &[
            "log",
            "--reverse",
            "--pretty=format:%h%x00%s",
            &format!("develop..{}", workspace.branch),
        ],
    )?;

    Ok(output
        .lines()
        .filter_map(|line| {
            let (hash, subject) = line.split_once('\0')?;
            Some(GitCommit {
                hash: hash.to_string(),
                subject: subject.to_string(),
            })
        })
        .collect())
}

fn merge_files_for(workspace: &WorkspaceRecord) -> Result<Vec<GitFile>, String> {
    let range = format!("develop...{}", workspace.branch);
    let output = run_git(&workspace.worktree_root, &["diff", "--name-status", &range])?;

    output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            let status = line.split_whitespace().next().unwrap_or("M").to_string();
            let path = line
                .split_whitespace()
                .last()
                .unwrap_or_default()
                .to_string();
            let app_path = app_relative_status_path(workspace, &path);

            Ok(GitFile {
                status,
                path,
                app_path,
            })
        })
        .collect()
}

fn develop_commits_for(workspace: &WorkspaceRecord) -> Result<Vec<GitCommit>, String> {
    let output = run_git(
        &workspace.worktree_root,
        &[
            "log",
            "--reverse",
            "--pretty=format:%h%x00%s",
            &format!("{}..develop", workspace.branch),
        ],
    )?;

    Ok(output
        .lines()
        .filter_map(|line| {
            let (hash, subject) = line.split_once('\0')?;
            Some(GitCommit {
                hash: hash.to_string(),
                subject: subject.to_string(),
            })
        })
        .collect())
}

fn develop_files_for(workspace: &WorkspaceRecord) -> Result<Vec<GitFile>, String> {
    let range = format!("{}...develop", workspace.branch);
    let output = run_git(&workspace.worktree_root, &["diff", "--name-status", &range])?;

    output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            let status = line.split_whitespace().next().unwrap_or("M").to_string();
            let path = line
                .split_whitespace()
                .last()
                .unwrap_or_default()
                .to_string();
            let app_path = app_relative_status_path(workspace, &path);

            Ok(GitFile {
                status,
                path,
                app_path,
            })
        })
        .collect()
}

fn commit_count(root: &Path, range: &str) -> Result<u32, String> {
    let output = run_git(root, &["rev-list", "--count", range])?;
    output
        .trim()
        .parse::<u32>()
        .map_err(|error| error.to_string())
}

fn app_relative_status_path(workspace: &WorkspaceRecord, repo_path: &str) -> Option<String> {
    let repo_path = repo_path.replace('\\', "/");
    if is_shared_skill_path(&repo_path) {
        return Some(repo_path);
    }

    let app_prefix = workspace.app_relative_path.replace('\\', "/");

    if app_prefix.is_empty() {
        return Some(repo_path);
    }

    repo_path
        .strip_prefix(&format!("{}/", app_prefix))
        .map(|path| path.to_string())
}

fn repo_path_for_app_path(workspace: &WorkspaceRecord, app_path: &str) -> Result<String, String> {
    let app_path = app_path.trim();
    let relative_path = Path::new(app_path);

    if relative_path.is_absolute()
        || relative_path
            .components()
            .any(|component| matches!(component, Component::ParentDir))
    {
        return Err("Path must stay inside the workspace".to_string());
    }

    let app_path = app_path.replace('\\', "/");
    if is_shared_skill_path(&app_path) {
        return Ok(app_path);
    }

    let app_prefix = workspace.app_relative_path.replace('\\', "/");

    if app_prefix.is_empty() {
        Ok(app_path)
    } else {
        Ok(format!("{}/{}", app_prefix, app_path))
    }
}

fn clean_repo_path(path: &str) -> Result<String, String> {
    let path = path.trim().replace('\\', "/");
    if path.is_empty() {
        return Err("Path is required".to_string());
    }

    let relative_path = Path::new(&path);
    if relative_path.is_absolute()
        || relative_path
            .components()
            .any(|component| matches!(component, Component::ParentDir))
    {
        return Err("Path must stay inside the workspace".to_string());
    }

    Ok(path)
}

fn discard_status_line(root: &Path, line: &str) -> Result<(), String> {
    let paths = status_paths(line);

    if !line.starts_with("??") {
        run_git_with_paths(
            root,
            &["restore", "--source=HEAD", "--staged", "--worktree", "--"],
            &paths,
        )?;
    }

    run_git_with_paths(root, &["clean", "-fd", "--"], &paths)?;
    Ok(())
}

fn status_paths(line: &str) -> Vec<String> {
    let status = line.chars().take(2).collect::<String>();
    let path_text = line.chars().skip(3).collect::<String>();

    if status.contains('R') {
        if let Some((old_path, new_path)) = path_text.split_once(" -> ") {
            return vec![old_path.to_string(), new_path.to_string()];
        }
    }

    vec![git_status_path(line)]
}

fn diff_hunks_for(root: &Path, repo_path: &str, status: &str) -> Result<Vec<DiffHunk>, String> {
    if status == "??" {
        let path = root.join(repo_path);
        let line_count = fs::read_to_string(path)
            .map(|contents| contents.lines().count().max(1))
            .unwrap_or(1);

        return Ok(vec![DiffHunk {
            original_start: 0,
            original_count: 0,
            current_start: 1,
            current_count: line_count,
        }]);
    }

    let diff = run_git(root, &["diff", "--unified=0", "HEAD", "--", repo_path])?;
    Ok(collect_diff_hunks(&diff))
}

fn diff_hunks_between(root: &Path, range: &str, repo_path: &str) -> Result<Vec<DiffHunk>, String> {
    let diff = run_git(root, &["diff", "--unified=0", range, "--", repo_path])?;
    Ok(collect_diff_hunks(&diff))
}

fn collect_diff_hunks(diff: &str) -> Vec<DiffHunk> {
    diff.lines().filter_map(parse_diff_hunk).collect()
}

fn parse_diff_hunk(line: &str) -> Option<DiffHunk> {
    if !line.starts_with("@@") {
        return None;
    }

    let mut parts = line.split_whitespace();
    parts.next()?;
    let (original_start, original_count) = parse_diff_range(parts.next()?, '-')?;
    let (current_start, current_count) = parse_diff_range(parts.next()?, '+')?;

    Some(DiffHunk {
        original_start,
        original_count,
        current_start,
        current_count,
    })
}

fn parse_diff_range(value: &str, prefix: char) -> Option<(usize, usize)> {
    let range = value.strip_prefix(prefix)?;
    let mut pieces = range.split(',');
    let start = pieces.next()?.parse::<usize>().ok()?;
    let count = pieces
        .next()
        .map(|value| value.parse::<usize>().ok())
        .unwrap_or(Some(1))?;

    Some((start, count))
}

fn run_git(root: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(command_error(&format!("git {}", args.join(" ")), &output));
    }

    String::from_utf8(output.stdout).map_err(|error| error.to_string())
}

fn run_git_with_paths(root: &Path, args: &[&str], paths: &[String]) -> Result<String, String> {
    let mut all_args = args.to_vec();
    all_args.extend(paths.iter().map(String::as_str));
    run_git(root, &all_args)
}

fn command_error(command: &str, output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stderr.is_empty() {
        format!("{} failed: {}", command, stderr)
    } else if !stdout.is_empty() {
        format!("{} failed: {}", command, stdout)
    } else {
        format!("{} failed", command)
    }
}

fn path_arg(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn pty_size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows: rows.max(1),
        cols: cols.max(1),
        pixel_width: 0,
        pixel_height: 0,
    }
}

fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(windows) {
            "cmd.exe".to_string()
        } else {
            "/bin/zsh".to_string()
        }
    })
}

fn default_command_path() -> String {
    let app_paths = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
    match std::env::var("PATH") {
        Ok(path) if !path.is_empty() => format!("{}:{}", app_paths, path),
        _ => app_paths.to_string(),
    }
}

fn kill_terminal_by_id(terminal_id: &str, state: &State<'_, WorkspaceState>) -> Result<(), String> {
    if let Some(session) = state
        .terminals
        .lock()
        .map_err(|_| "Terminal state is unavailable".to_string())?
        .remove(terminal_id)
    {
        kill_terminal_session(session)?;
    }
    Ok(())
}

fn kill_terminals_for_workspace(
    workspace_id: &str,
    state: &State<'_, WorkspaceState>,
) -> Result<(), String> {
    let sessions = {
        let mut terminals = state
            .terminals
            .lock()
            .map_err(|_| "Terminal state is unavailable".to_string())?;
        let terminal_ids = terminals
            .iter()
            .filter(|(_, session)| session.workspace_id == workspace_id)
            .map(|(terminal_id, _)| terminal_id.clone())
            .collect::<Vec<_>>();

        terminal_ids
            .into_iter()
            .filter_map(|terminal_id| terminals.remove(&terminal_id))
            .collect::<Vec<_>>()
    };

    for session in sessions {
        kill_terminal_session(session)?;
    }

    Ok(())
}

fn kill_terminal_session(session: TerminalSession) -> Result<(), String> {
    let _ = session
        .child
        .lock()
        .map_err(|_| "Terminal child is unavailable".to_string())?
        .kill();
    Ok(())
}

fn terminal_output_event(terminal_id: &str) -> String {
    format!("{}{}", TERMINAL_OUTPUT_EVENT_PREFIX, terminal_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let state = WorkspaceState::load(app.handle());
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_workspaces,
            get_editor_settings,
            save_editor_settings,
            create_workspace,
            create_app_from_custom_shell,
            set_active_workspace,
            set_workspace_hidden,
            delete_workspace,
            list_dir,
            read_text_file,
            read_repo_text_file,
            read_original_text_file,
            read_original_repo_text_file,
            read_develop_text_file,
            read_develop_repo_text_file,
            write_text_file,
            write_repo_text_file,
            create_text_file,
            create_pasted_image,
            create_folder,
            rename_path,
            trash_path,
            duplicate_path,
            reveal_path,
            open_server_url,
            list_tasks,
            create_task,
            list_skills,
            create_skill,
            list_docs,
            create_doc,
            git_status,
            git_status_basic,
            diff_hunks,
            repo_diff_hunks,
            merge_diff_hunks,
            repo_merge_diff_hunks,
            git_commit,
            git_sync,
            git_merge_to_develop,
            git_update_from_develop,
            git_discard_changes,
            git_discard_file,
            start_terminal,
            write_terminal,
            resize_terminal,
            kill_terminal
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
