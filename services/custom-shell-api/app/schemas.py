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
]

ThemePresetKey = Literal["graphite", "verdant", "ember", "cobalt"]
FontPresetKey = Literal["urbanist", "editorial", "industrial", "operator"]


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
    themePreset: ThemePresetKey
    fontPreset: FontPresetKey
    topNavigation: list[ShellTopNavigationItem]
    sections: list[ShellSection]


class ShellSettingsOut(BaseModel):
    settings: Optional[dict[str, Any]]
