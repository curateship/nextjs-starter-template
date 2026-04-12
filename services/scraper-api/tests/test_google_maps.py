import unittest

from app.services.google_maps import (
    build_google_maps_search_url,
    extract_coordinates,
    extract_place_external_id,
    normalize_google_maps_url,
)


class GoogleMapsHelpersTest(unittest.TestCase):
    def test_build_search_url_encodes_keyword_and_area(self):
        url = build_google_maps_search_url("dentist", "Toronto, Ontario")
        self.assertIn("dentist%20Toronto%2C%20Ontario", url)

    def test_normalize_google_maps_url_preserves_cid_only(self):
        url = "https://www.google.com/maps/place/Test/@43.1,-79.2,17z/data=!4m7!3m6!1s0x0:0x123?entry=ttu&g_ep=abc&cid=999"
        self.assertEqual(
            normalize_google_maps_url(url),
            "https://www.google.com/maps/place/Test/@43.1,-79.2,17z/data=!4m7!3m6!1s0x0:0x123?cid=999",
        )

    def test_extract_place_external_id_prefers_cid(self):
        url = "https://www.google.com/maps/place/Test/?cid=123456"
        self.assertEqual(extract_place_external_id(url), "123456")

    def test_extract_coordinates_from_place_url(self):
        latitude, longitude = extract_coordinates("https://www.google.com/maps/place/Test/!3d43.6532!4d-79.3832")
        self.assertEqual(latitude, 43.6532)
        self.assertEqual(longitude, -79.3832)


if __name__ == "__main__":
    unittest.main()
