from pydantic import BaseModel, Field, field_validator

from .scraper import validate_url_shape


class PageMetadataInput(BaseModel):
    url: str = Field(min_length=1, max_length=2048)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        return validate_url_shape(value)
