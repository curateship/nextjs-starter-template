# Automation Phase 1: Instagram Reels Scraper — Standalone Python Module

## Context

Build a standalone, reusable Instagram Reels scraper as the first piece of the automation infrastructure. It runs locally as a plain Python script, with Modal deployment added later. Lives in `automations/` at the repo root (monorepo approach). Designed as a connector layer that can be used standalone or plugged into the larger automation system.

## What Gets Built

A Python module that:
1. Takes an Instagram username
2. Opens the profile's Reels tab via Playwright
3. Scrolls and extracts all reels (or up to a configurable limit)
4. For each reel, extracts: shortcode, URL, caption, views, likes, comments, duration, audio, hashtags, mentions, posted date
5. Returns structured data (Pydantic models) or saves to JSON/CSV
6. Handles anti-detection: random delays, user-agent rotation, viewport randomization
7. Gracefully handles errors: private profiles, rate limits, missing data

## File Structure

```
automations/
├── pyproject.toml                     # Project config, dependencies
├── requirements.txt                   # Pip-compatible deps
├── README.md                          # Usage docs
├── run.py                             # CLI entry point
├── scrapers/
│   ├── __init__.py
│   ├── base.py                        # BaseScraper abstract class
│   └── instagram/
│       ├── __init__.py
│       ├── profile_scraper.py         # Scrape profile info (bio, followers, etc.)
│       ├── reels_scraper.py           # Scrape reels list + metrics
│       ├── constants.py               # Selectors, URLs, config
│       └── types.py                   # Pydantic models for scraped data
├── utils/
│   ├── __init__.py
│   ├── browser.py                     # Playwright browser manager (launch, stealth, cleanup)
│   ├── anti_detect.py                 # User-agent rotation, delays, viewport randomization
│   └── export.py                      # Export to JSON, CSV, or dict
└── tests/
    ├── __init__.py
    └── test_instagram_scraper.py      # Basic tests
```

## Key Components

### `scrapers/base.py` — BaseScraper
```python
class BaseScraper(ABC):
    """Base class all scrapers inherit from."""
    async def setup(self) -> None: ...       # Launch browser
    async def teardown(self) -> None: ...    # Close browser
    @abstractmethod
    async def scrape(self, **kwargs) -> Any: ...
    async def __aenter__(self): ...          # Context manager support
    async def __aexit__(self): ...
```

### `scrapers/instagram/types.py` — Data Models
```python
class InstagramProfile(BaseModel):
    username: str
    display_name: str | None
    bio: str | None
    follower_count: int | None
    following_count: int | None
    post_count: int | None
    profile_image_url: str | None
    is_private: bool
    is_verified: bool

class InstagramReel(BaseModel):
    shortcode: str                    # URL slug (e.g., "CxYz123")
    url: str                          # Full reel URL
    thumbnail_url: str | None
    caption: str | None
    view_count: int | None
    like_count: int | None
    comment_count: int | None
    duration_seconds: float | None
    audio_name: str | None
    hashtags: list[str]
    mentions: list[str]
    posted_at: datetime | None
    scraped_at: datetime              # When we captured this

class ScrapeResult(BaseModel):
    profile: InstagramProfile
    reels: list[InstagramReel]
    total_found: int
    scraped_count: int
    errors: list[str]
    duration_seconds: float
```

### `scrapers/instagram/reels_scraper.py` — Core Scraper

**Approach:**
1. Navigate to `instagram.com/{username}/reels/`
2. Check if profile is private → abort early with clear message
3. Wait for reels grid to load
4. Scroll incrementally to load more reels (Instagram uses infinite scroll / lazy loading)
5. Extract reel links from the grid (each reel has a shortcode in its link)
6. For each reel, navigate to its page and extract detailed data
7. Parse view/like/comment counts, caption, audio, timestamps
8. Return structured `ScrapeResult`

**Key config options:**
```python
class ReelsScraperConfig(BaseModel):
    max_reels: int = 50               # Max reels to scrape (0 = all)
    scroll_pause_min: float = 1.0     # Min seconds between scrolls
    scroll_pause_max: float = 3.0     # Max seconds between scrolls
    page_load_timeout: int = 30000    # ms
    headless: bool = True             # Run headless or visible
    skip_detail_pages: bool = False   # If True, only get grid data (faster but less data)
```

### `utils/browser.py` — Browser Manager
- Launch Playwright Chromium with stealth settings
- Configurable: headless mode, proxy support, viewport size
- Auto-cleanup on exit

### `utils/anti_detect.py` — Anti-Detection
- User-agent string rotation (pool of real Chrome user-agents)
- Random viewport sizes (common desktop resolutions)
- Random delays between actions (human-like timing)
- Mouse movement simulation before clicks
- Randomized scroll distances

### `run.py` — CLI Entry Point
```bash
# Scrape a single profile
python run.py scrape garyvee --max-reels 30 --output results/garyvee.json

# Scrape multiple profiles
python run.py scrape garyvee hormozi alexferguson --max-reels 50 --output results/

# Scrape with visible browser (for debugging)
python run.py scrape garyvee --no-headless

# Export as CSV
python run.py scrape garyvee --format csv --output results/garyvee.csv
```

Uses `argparse` or `click` for CLI parsing.

## Dependencies

```
# requirements.txt
playwright>=1.40.0
pydantic>=2.0.0
```

Optional (for CLI convenience):
```
click                     # CLI framework (or just use argparse)
```

## Anti-Detection Strategy

Instagram aggressively blocks bots. Our approach:

1. **No login required** — Only scrape public profiles, no auth cookies needed
2. **Realistic browser fingerprint** — Playwright Chromium with real user-agent strings
3. **Human-like timing** — Random delays (1-3s between scrolls, 2-5s between page loads)
4. **Viewport variation** — Random common screen sizes per session
5. **No parallel requests** — Sequential page loads to mimic real browsing
6. **Session limits** — Don't scrape more than ~100 reels per session to avoid triggers
7. **Error handling** — If Instagram shows a challenge/CAPTCHA page, abort gracefully and report

**Not doing (for now):**
- Proxy rotation (add later if needed)
- Cookie persistence between runs
- Login-based scraping

## Deployment

The scraper **cannot run on Vercel** due to Playwright/Chromium size (~400MB) exceeding Vercel's 250MB function limit and timeout constraints. Deployment options for later:

| Option | Cost | Notes |
|---|---|---|
| **Modal** (recommended) | ~$0/month free tier | Serverless Python, pay-per-second, native Playwright support |
| **Railway** | ~$5/month | Always-on Docker container |
| **Fly.io** | ~$5/month | Global edge, Dockerfile deploy |
| **VPS** (Hetzner/DO) | $5-10/month | Full control, self-managed |

Next.js app will call the deployed scraper via HTTP when ready.

## Implementation Steps

### Step 1: Project Setup
- Create `automations/` directory
- Create `pyproject.toml` with project config
- Create `requirements.txt`
- Install dependencies

### Step 2: Browser Utils
- `utils/browser.py` — Playwright browser launch with stealth config
- `utils/anti_detect.py` — User-agent pool, random delays, viewport randomization

### Step 3: Data Models
- `scrapers/instagram/types.py` — Pydantic models for Profile, Reel, ScrapeResult

### Step 4: Base Scraper
- `scrapers/base.py` — Abstract base with setup/teardown/context manager

### Step 5: Profile Scraper
- `scrapers/instagram/profile_scraper.py` — Navigate to profile, extract bio/followers/etc., detect private profiles

### Step 6: Reels Scraper
- `scrapers/instagram/reels_scraper.py` — Scroll reels tab, extract reel links, navigate to detail pages, parse metrics
- `scrapers/instagram/constants.py` — CSS selectors, URL patterns

### Step 7: Export Utils
- `utils/export.py` — Save results as JSON or CSV

### Step 8: CLI
- `run.py` — CLI entry point with argparse/click

### Step 9: Test
- Run against 2-3 known public profiles
- Verify data extraction accuracy
- Test private profile handling
- Test error recovery

## Verification

1. `python run.py scrape garyvee --max-reels 10 --output test.json` → verify JSON has profile + 10 reels with all fields
2. `python run.py scrape garyvee --max-reels 5 --format csv --output test.csv` → verify CSV output
3. Test with a private profile → verify graceful abort with `is_private: true`
4. Test with non-existent username → verify clear error
5. Inspect scraped data: views, likes, comments should be reasonable numbers, captions should have full text, hashtags parsed correctly

## Future Phases

- **Phase 2:** AI analysis pipeline (trend detection, content extraction, recommendations)
- **Phase 3:** Supabase integration (tracked_profiles, viral_tracker_reels, viral_tracker_analysis tables)
- **Phase 4:** Next.js admin dashboard (profile management, analytics, charts)
- **Phase 5:** Modal deployment + scheduling (Vercel Cron triggers Modal)
