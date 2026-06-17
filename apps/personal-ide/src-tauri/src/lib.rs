use serde::Serialize;
use std::{
    fs,
    path::{Component, Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

const MAX_FILE_SIZE: u64 = 1024 * 1024;

#[derive(Default)]
struct WorkspaceState {
    root: Mutex<Option<PathBuf>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceInfo {
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[tauri::command]
async fn pick_workspace_folder(
    app: AppHandle,
    state: State<'_, WorkspaceState>,
) -> Result<Option<WorkspaceInfo>, String> {
    let Some(selected) = app
        .dialog()
        .file()
        .set_title("Open Workspace")
        .blocking_pick_folder()
    else {
        return Ok(None);
    };

    let path = selected
        .into_path()
        .map_err(|_| "Selected folder is not a local path".to_string())?;
    let root = fs::canonicalize(path).map_err(|error| error.to_string())?;

    if !root.is_dir() {
        return Err("Selected path is not a folder".to_string());
    }

    let name = root
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "Workspace".to_string());

    *state
        .root
        .lock()
        .map_err(|_| "Workspace state is unavailable".to_string())? = Some(root.clone());

    Ok(Some(WorkspaceInfo { name }))
}

#[tauri::command]
fn list_dir(path: Option<String>, state: State<'_, WorkspaceState>) -> Result<Vec<FileEntry>, String> {
    let root = current_root(&state)?;
    let folder = resolve_inside(&root, path.as_deref())?;

    if !folder.is_dir() {
        return Err("Path is not a folder".to_string());
    }

    let mut entries = Vec::new();

    for entry in fs::read_dir(&folder).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let metadata = entry.metadata().map_err(|error| error.to_string())?;

        if !metadata.is_dir() && !metadata.is_file() {
            continue;
        }

        let path = entry.path();
        entries.push(FileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: relative_path(&root, &path)?,
            is_dir: metadata.is_dir(),
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
fn read_text_file(path: String, state: State<'_, WorkspaceState>) -> Result<String, String> {
    let root = current_root(&state)?;
    let file = resolve_inside(&root, Some(&path))?;
    let metadata = fs::metadata(&file).map_err(|error| error.to_string())?;

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

#[tauri::command]
fn write_text_file(
    path: String,
    contents: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let root = current_root(&state)?;
    let file = resolve_inside(&root, Some(&path))?;
    let metadata = fs::metadata(&file).map_err(|error| error.to_string())?;

    if !metadata.is_file() {
        return Err("Path is not a file".to_string());
    }

    if contents.as_bytes().len() as u64 > MAX_FILE_SIZE {
        return Err("File is larger than 1 MiB".to_string());
    }

    let existing = fs::read(&file).map_err(|error| error.to_string())?;
    if existing.contains(&0) || String::from_utf8(existing).is_err() {
        return Err("Binary files are not supported".to_string());
    }

    fs::write(file, contents).map_err(|error| error.to_string())
}

fn current_root(state: &State<'_, WorkspaceState>) -> Result<PathBuf, String> {
    state
        .root
        .lock()
        .map_err(|_| "Workspace state is unavailable".to_string())?
        .clone()
        .ok_or_else(|| "Open a workspace first".to_string())
}

fn resolve_inside(root: &Path, relative: Option<&str>) -> Result<PathBuf, String> {
    let relative = relative.unwrap_or_default();
    let path = if relative.is_empty() {
        root.to_path_buf()
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
    if !canonical.starts_with(root) {
        return Err("Path must stay inside the workspace".to_string());
    }

    Ok(canonical)
}

fn relative_path(root: &Path, path: &Path) -> Result<String, String> {
    let relative = path.strip_prefix(root).map_err(|error| error.to_string())?;

    Ok(relative
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WorkspaceState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            pick_workspace_folder,
            list_dir,
            read_text_file,
            write_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
