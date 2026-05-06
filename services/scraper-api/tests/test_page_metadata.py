import unittest
from unittest.mock import patch

from app.modules.page_metadata.normalize import normalize_page
from app.modules.page_metadata.scraper import FetchedPage, UnsafeUrlError, validate_public_url, validate_url_shape


class PageMetadataTest(unittest.TestCase):
    def test_url_shape_blocks_localhost(self):
        with self.assertRaises(UnsafeUrlError):
            validate_url_shape("http://localhost:3000")

    def test_url_shape_blocks_private_ip(self):
        with self.assertRaises(UnsafeUrlError):
            validate_url_shape("http://192.168.1.10")

    def test_public_url_checks_resolved_addresses(self):
        with patch("socket.getaddrinfo", return_value=[(None, None, None, None, ("93.184.216.34", 0))]):
            self.assertEqual(validate_public_url("https://example.com/path#section"), "https://example.com/path")

    def test_extracts_metadata_from_html(self):
        page = FetchedPage(
            request_url="https://example.com",
            final_url="https://example.com/",
            status_code=200,
            content_type="text/html; charset=utf-8",
            encoding="utf-8",
            body=b"""
                <html>
                  <head>
                    <title>Example Title</title>
                    <meta name="description" content="Example description">
                    <link rel="canonical" href="https://example.com/canonical">
                  </head>
                  <body>
                    <h1>Main Heading</h1>
                    <p>Hello world from the scraper.</p>
                    <a href="/one">One</a>
                    <img src="/image.png">
                  </body>
                </html>
            """,
        )

        result = normalize_page(page)
        self.assertEqual(result["title"], "Example Title")
        self.assertEqual(result["description"], "Example description")
        self.assertEqual(result["h1"], "Main Heading")
        self.assertEqual(result["canonical_url"], "https://example.com/canonical")
        self.assertEqual(result["link_count"], 1)
        self.assertEqual(result["image_count"], 1)
        self.assertGreater(result["word_count"], 0)


if __name__ == "__main__":
    unittest.main()
