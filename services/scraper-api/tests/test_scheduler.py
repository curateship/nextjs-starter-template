import unittest
from datetime import datetime, timezone

from app.services.worker import advance_schedule_time


class SchedulerHelpersTest(unittest.TestCase):
    def test_daily_schedule_advances_one_day(self):
        now = datetime(2026, 4, 12, 12, 0, tzinfo=timezone.utc)
        self.assertEqual(
            advance_schedule_time(now, "daily"),
            datetime(2026, 4, 13, 12, 0, tzinfo=timezone.utc),
        )

    def test_weekly_schedule_advances_seven_days(self):
        now = datetime(2026, 4, 12, 12, 0, tzinfo=timezone.utc)
        self.assertEqual(
            advance_schedule_time(now, "weekly"),
            datetime(2026, 4, 19, 12, 0, tzinfo=timezone.utc),
        )

    def test_monthly_schedule_clamps_end_of_month(self):
        now = datetime(2026, 1, 31, 12, 0, tzinfo=timezone.utc)
        self.assertEqual(
            advance_schedule_time(now, "monthly"),
            datetime(2026, 2, 28, 12, 0, tzinfo=timezone.utc),
        )


if __name__ == "__main__":
    unittest.main()
