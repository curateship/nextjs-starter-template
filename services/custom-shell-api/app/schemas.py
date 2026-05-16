from __future__ import annotations

from typing import Annotated, Any, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field

IconKey = Literal[
    "layoutDashboard",
    "bookOpen",
    "package",
    "folderOpen",
    "mail",
    "calendar",
    "tag",
    "image",
    "settings",
    "barChart3",
    "clipboardCheck",
    "creditCard",
    "heartPulse",
    "globe",
    "users",
    "workflow",
    "appWindow",
    "briefcaseBusiness",
    "palette",
    "type",
    "panelsTopLeft",
    "library",
    "slidersHorizontal",
    "shieldCheck",
    "sparkles",
    "messageSquarePlus",
]

FeedbackType = Literal["suggestion", "bug_report", "question", "praise"]
MediaFileType = Literal["image", "video"]

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ShellChildItem(StrictModel):
    id: str = Field(min_length=1)
    label: str
    href: str
    icon: Optional[IconKey] = None


class ShellItem(StrictModel):
    type: Literal["item"]
    id: str = Field(min_length=1)
    label: str
    href: str
    icon: IconKey
    visible: bool
    children: Optional[list[ShellChildItem]] = None


class ShellDivider(StrictModel):
    type: Literal["divider"]
    id: str = Field(min_length=1)
    label: str


ShellEntry = Annotated[Union[ShellItem, ShellDivider], Field(discriminator="type")]


class ShellSection(StrictModel):
    id: str = Field(min_length=1)
    title: str
    entries: list[ShellEntry]


class ShellTopNavigationItem(StrictModel):
    id: str = Field(min_length=1)
    label: str
    href: str
    icon: IconKey
    visible: bool


class ShellConfigIn(StrictModel):
    appName: str
    workspaceName: str
    workspacePlan: str
    topNavigation: list[ShellTopNavigationItem]
    sections: list[ShellSection]


class ShellSettingsOut(BaseModel):
    settings: Optional[dict[str, Any]]


class AuthLoginIn(StrictModel):
    email: str = Field(min_length=1)
    password: str = Field(min_length=1)


class CustomShellUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    name: str
    role: str


class AuthMeOut(BaseModel):
    user: CustomShellUserOut


class FeedbackCreateIn(StrictModel):
    type: FeedbackType
    message: str = Field(min_length=1, max_length=5000)


class FeedbackOut(BaseModel):
    id: str
    type: FeedbackType
    message: str
    author_name: str
    created_at: str
    updated_at: str
    vote_count: int
    has_voted: bool


class FeedbackListOut(BaseModel):
    feedback: list[FeedbackOut]


class MediaOut(BaseModel):
    id: str
    filename: str
    original_name: str
    alt_text: Optional[str]
    file_size: int
    mime_type: str
    file_type: MediaFileType
    url: str
    created_at: str
    updated_at: str


class MediaListOut(BaseModel):
    media: list[MediaOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class MediaUpdateIn(StrictModel):
    alt_text: Optional[str] = None


class MediaBulkDeleteIn(StrictModel):
    ids: list[str] = Field(min_length=1, max_length=100)


class MediaBulkDeleteOut(BaseModel):
    deleted_count: int
