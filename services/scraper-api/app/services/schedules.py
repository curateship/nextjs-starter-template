from __future__ import annotations

import calendar
from datetime import datetime, timedelta


def advance_schedule_time(base: datetime, cadence: str) -> datetime:
    if cadence == "daily":
        return base + timedelta(days=1)

    if cadence == "weekly":
        return base + timedelta(days=7)

    if cadence == "monthly":
        month = base.month + 1
        year = base.year
        if month > 12:
            year += 1
            month = 1

        day = min(base.day, calendar.monthrange(year, month)[1])
        return base.replace(year=year, month=month, day=day)

    raise ValueError(f"Unsupported cadence: {cadence}")
