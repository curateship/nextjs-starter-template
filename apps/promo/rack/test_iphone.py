"""Tests for the iPhone side of the rack program. Run from apps/promo:

    python3 -m unittest discover -s rack -p "test_*.py"

No iPhone, pymobiledevice3 or WebDriverAgent is needed: fakes stand in for
both. Whether a real iPhone lists, taps and types is only proved on the rack.
"""

import json
import os
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import iphone  # noqa: E402


# A Reddit screen as WebDriverAgent's /source?format=xml gives it, in points.
SOURCE = """<?xml version="1.0" encoding="UTF-8"?>
<XCUIElementTypeApplication type="XCUIElementTypeApplication" name="Reddit" label="Reddit" enabled="true" visible="true" x="0" y="0" width="390" height="844" index="0">
  <XCUIElementTypeWindow type="XCUIElementTypeWindow" enabled="true" visible="true" x="0" y="0" width="390" height="844" index="0">
    <XCUIElementTypeButton type="XCUIElementTypeButton" name="post_button" label="Post" enabled="true" visible="true" x="300" y="60" width="60" height="40" index="0"/>
    <XCUIElementTypeTextField type="XCUIElementTypeTextField" value="hello" name="comment_box" label="Add a comment" enabled="true" visible="true" x="10" y="700" width="370" height="44" index="1"/>
    <XCUIElementTypeSecureTextField type="XCUIElementTypeSecureTextField" name="password" enabled="true" visible="true" x="10" y="400" width="370" height="44" index="2"/>
    <XCUIElementTypeTextView type="XCUIElementTypeTextView" value="A longer note" enabled="true" visible="true" x="10" y="460" width="370" height="100" index="3"/>
    <XCUIElementTypeStaticText type="XCUIElementTypeStaticText" value="Update" enabled="true" visible="true" x="20" y="200" width="100" height="20" index="4"/>
    <XCUIElementTypeStaticText type="XCUIElementTypeStaticText" value="Updates" enabled="true" visible="true" x="20" y="230" width="100" height="20" index="5"/>
    <XCUIElementTypeSwitch type="XCUIElementTypeSwitch" name="auto_updates" label="Automatic updates" value="1" enabled="true" visible="true" x="320" y="300" width="50" height="30" index="6"/>
    <XCUIElementTypeTable type="XCUIElementTypeTable" enabled="true" visible="true" x="0" y="100" width="390" height="700" index="7"/>
  </XCUIElementTypeWindow>
</XCUIElementTypeApplication>
"""


class ModelNameTest(unittest.TestCase):
    def test_common_models_get_their_name(self):
        self.assertEqual(iphone.model_name("iPhone12,1"), "iPhone 11")
        self.assertEqual(iphone.model_name("iPhone12,3"), "iPhone 11 Pro")
        self.assertEqual(iphone.model_name("iPhone12,5"), "iPhone 11 Pro Max")
        self.assertEqual(iphone.model_name("iPhone13,2"), "iPhone 12")
        self.assertEqual(iphone.model_name("iPhone14,5"), "iPhone 13")
        self.assertEqual(iphone.model_name("iPhone14,6"), "iPhone SE (3rd generation)")
        self.assertEqual(iphone.model_name("iPhone15,4"), "iPhone 15")
        self.assertEqual(iphone.model_name("iPhone17,3"), "iPhone 16")

    def test_an_unknown_model_keeps_apples_number(self):
        self.assertEqual(iphone.model_name("iPhone99,9"), "iPhone99,9")
        self.assertEqual(iphone.model_name(""), "")

    def test_reads_the_major_ios_version(self):
        self.assertEqual(iphone.ios_major("17.6.1"), 17)
        self.assertEqual(iphone.ios_major("18"), 18)
        self.assertIsNone(iphone.ios_major(""))


class ListTest(unittest.TestCase):
    def setUp(self):
        iphone._VALUES.clear()
        iphone._DRIVERS.clear()
        iphone._SESSIONS.clear()

    def test_returns_nothing_without_pymobiledevice3(self):
        with mock.patch.object(iphone, "_pymobiledevice3", return_value=None):
            self.assertEqual(iphone.list_iphones(), [])

    def test_the_four_states(self):
        values = {
            "trusted": {"productType": "iPhone14,5", "android": "17.6.1", "timezone": "America/Toronto"},
            "old": {"productType": "iPhone12,1", "android": "16.7.8", "timezone": "America/Toronto"},
            "dead": {"productType": "iPhone13,2", "android": "18.0", "timezone": "Europe/London"},
        }

        def read(udid):
            if udid == "untrusted":
                raise iphone._NotTrusted("PairingDialogResponsePendingError")
            return values[udid]

        with mock.patch.object(iphone, "_pymobiledevice3", return_value={}), \
                mock.patch.object(iphone, "_usb_udids", return_value=["trusted", "untrusted", "old", "dead"]), \
                mock.patch.object(iphone, "_read_lockdown", side_effect=read), \
                mock.patch.object(iphone, "driver_state", side_effect=lambda udid: "no_driver" if udid == "dead" else "device"):
            phones = iphone.list_iphones()
        self.assertEqual(phones, [
            {"serial": "trusted", "state": "device", "usb": "", "model": "iPhone 13", "android": "17.6.1", "timezone": "America/Toronto", "kind": "iphone"},
            {"serial": "untrusted", "state": "unauthorized", "usb": "", "model": "", "android": "", "timezone": "", "kind": "iphone"},
            {"serial": "old", "state": "too_old", "usb": "", "model": "iPhone 11", "android": "16.7.8", "timezone": "America/Toronto", "kind": "iphone"},
            {"serial": "dead", "state": "no_driver", "usb": "", "model": "iPhone 12", "android": "18.0", "timezone": "Europe/London", "kind": "iphone"},
        ])

    def test_one_bad_phone_is_skipped_and_the_rest_listed(self):
        def read(udid):
            if udid == "broken":
                raise RuntimeError("usbmux closed the connection")
            return {"productType": "iPhone14,5", "android": "17.6.1", "timezone": ""}

        with mock.patch.object(iphone, "_pymobiledevice3", return_value={}), \
                mock.patch.object(iphone, "_usb_udids", return_value=["broken", "fine"]), \
                mock.patch.object(iphone, "_read_lockdown", side_effect=read), \
                mock.patch.object(iphone, "driver_state", return_value="device"), \
                mock.patch.object(iphone, "log"):
            phones = iphone.list_iphones()
        self.assertEqual([phone["serial"] for phone in phones], ["fine"])

    def test_values_are_read_once_and_forgotten_when_unplugged(self):
        read = mock.Mock(return_value={"productType": "iPhone14,5", "android": "17.6.1", "timezone": ""})
        with mock.patch.object(iphone, "_pymobiledevice3", return_value={}), \
                mock.patch.object(iphone, "_read_lockdown", read), \
                mock.patch.object(iphone, "driver_state", return_value="device"):
            with mock.patch.object(iphone, "_usb_udids", return_value=["a"]):
                iphone.list_iphones()
                iphone.list_iphones()
            self.assertEqual(read.call_count, 1)
            with mock.patch.object(iphone, "_usb_udids", return_value=[]):
                self.assertEqual(iphone.list_iphones(), [])
            self.assertEqual(iphone._VALUES, {})


class HierarchyTest(unittest.TestCase):
    def test_converts_webdriveragent_source_to_uiautomator_nodes(self):
        xml = iphone.convert_source(SOURCE, 3, "com.reddit.Reddit")
        nodes = iphone.nodes_of(xml)
        self.assertTrue(xml.startswith("<hierarchy"))
        self.assertEqual(len(nodes), 10)
        post = next(node for node in nodes if node["resource-id"] == "post_button")
        self.assertEqual(post["text"], "Post")
        self.assertEqual(post["class"], "XCUIElementTypeButton")
        self.assertEqual(post["package"], "com.reddit.Reddit")
        self.assertEqual(post["content-desc"], "Post")
        self.assertEqual(post["label"], "Post")
        self.assertEqual(post["name"], "post_button")
        self.assertEqual(post["type"], "XCUIElementTypeButton")
        self.assertEqual(post["bounds"], "[900,180][1080,300]")

    def test_text_is_the_label_else_the_value_else_the_name(self):
        nodes = iphone.nodes_of(iphone.convert_source(SOURCE, 2))
        by_name = {node["name"]: node for node in nodes if node["name"]}
        self.assertEqual(by_name["comment_box"]["text"], "Add a comment")
        self.assertEqual(by_name["comment_box"]["value"], "hello")
        self.assertEqual(by_name["password"]["text"], "password")
        note = next(node for node in nodes if node["type"] == "XCUIElementTypeTextView")
        self.assertEqual(note["text"], "A longer note")
        self.assertEqual(by_name["post_button"]["package"], "")

    def test_switches_carry_checked_and_tables_carry_scrollable(self):
        nodes = iphone.nodes_of(iphone.convert_source(SOURCE, 2))
        switch = next(node for node in nodes if node["name"] == "auto_updates")
        self.assertEqual((switch["checkable"], switch["checked"]), ("true", "true"))
        table = next(node for node in nodes if node["type"] == "XCUIElementTypeTable")
        self.assertEqual(table["scrollable"], "true")

    def test_bounds_parse_back_to_the_dict_shape(self):
        self.assertEqual(iphone.parse_bounds("[900,180][1080,300]"), {"left": 900, "top": 180, "right": 1080, "bottom": 300})
        self.assertEqual(iphone.parse_bounds("nonsense"), {"left": 0, "top": 0, "right": 0, "bottom": 0})


class SelectorTest(unittest.TestCase):
    def setUp(self):
        self.nodes = iphone.nodes_of(iphone.convert_source(SOURCE, 3, "com.reddit.Reddit"))

    def names(self, **selector):
        return [node["text"] for node in iphone.find_nodes(self.nodes, selector)]

    def test_text_is_an_exact_match(self):
        self.assertEqual(self.names(text="Post"), ["Post"])
        self.assertEqual(self.names(text="Pos"), [])

    def test_text_matches_is_a_full_match_like_uiautomator(self):
        self.assertEqual(self.names(textMatches="(?i)^update$"), ["Update"])
        self.assertEqual(self.names(textMatches="(?i)update"), ["Update"])
        self.assertEqual(self.names(textMatches="Update.*"), ["Update", "Updates"])

    def test_text_contains_and_description(self):
        self.assertEqual(self.names(textContains="comment"), ["Add a comment"])
        self.assertEqual(self.names(description="Automatic updates"), ["Automatic updates"])
        self.assertEqual(self.names(descriptionMatches="(?i)^post$"), ["Post"])

    def test_resource_id_is_the_name(self):
        self.assertEqual(self.names(resourceId="comment_box"), ["Add a comment"])
        self.assertEqual(self.names(resourceIdMatches=".*_box$"), ["Add a comment"])

    def test_edit_text_means_every_kind_of_text_field(self):
        self.assertEqual(
            sorted(node["type"] for node in iphone.find_nodes(self.nodes, {"className": "android.widget.EditText"})),
            ["XCUIElementTypeSecureTextField", "XCUIElementTypeTextField", "XCUIElementTypeTextView"],
        )
        self.assertEqual(self.names(className="android.widget.Button"), ["Post"])
        self.assertEqual(self.names(className="XCUIElementTypeButton"), ["Post"])
        self.assertEqual(self.names(className="Button"), ["Post"])

    def test_package_scrollable_checked_and_several_words_together(self):
        self.assertEqual(len(self.names(packageName="com.reddit.Reddit")), 10)
        self.assertEqual(self.names(packageName="com.other.app"), [])
        self.assertEqual(self.names(scrollable=True), [""])
        self.assertEqual(self.names(checked=True), ["Automatic updates"])
        self.assertEqual(self.names(text="Post", className="android.widget.Button"), ["Post"])
        self.assertEqual(self.names(text="Post", className="android.widget.EditText"), [])

    def test_a_selector_word_with_no_iphone_meaning_is_refused(self):
        with self.assertRaises(iphone.IphoneError):
            iphone.find_nodes(self.nodes, {"longClickable": True})


class FakeImage(object):
    width, height = 1170, 2532


class FakeWda(object):
    """WebDriverAgent as the HTTP calls see it: writes every call down."""

    def __init__(self, scale=3, source=SOURCE, front="com.reddit.Reddit"):
        self.calls = []
        self.scale = scale
        self.source = source
        self.front = front

    def http(self, port, method, path, body=None, timeout=None):
        self.calls.append((method, path, body))
        if path.endswith("/wda/screen"):
            return {"value": {"scale": self.scale, "statusBarSize": {"width": 390, "height": 47}}}
        if path.endswith("/window/size"):
            return {"value": {"width": 390, "height": 844}}
        if path.endswith("/source?format=xml"):
            return {"value": self.source}
        if path.endswith("/wda/activeAppInfo"):
            return {"value": {"bundleId": self.front, "pid": 1}}
        if path.endswith("/screenshot"):
            return {"value": "cG5n"}
        return {"value": None}


def screen_with(fake):
    """An IphoneScreen whose session is "S1" and whose HTTP goes to the fake."""
    patches = [
        mock.patch.object(iphone, "_http", side_effect=fake.http),
        mock.patch.object(iphone, "_session_id", return_value="S1"),
        mock.patch.object(iphone, "_port", return_value=1),
        mock.patch.object(iphone, "_image_from_png", return_value=FakeImage()),
        mock.patch.object(iphone.time, "sleep"),
    ]
    return patches, iphone.IphoneScreen("udid-1")


class ScreenTest(unittest.TestCase):
    def setUp(self):
        self.fake = FakeWda()
        self.patches, self.screen = screen_with(self.fake)
        for patch in self.patches:
            patch.start()
            self.addCleanup(patch.stop)

    def actions(self):
        return [body["actions"][0]["actions"] for method, path, body in self.fake.calls if path.endswith("/actions")]

    def test_bounds_come_in_pixels(self):
        element = self.screen(text="Post")
        self.assertTrue(element.exists)
        self.assertEqual(element.info["bounds"], {"left": 900, "top": 180, "right": 1080, "bottom": 300})
        self.assertEqual(element.info["text"], "Post")
        self.assertEqual(element.get_text(), "Post")
        self.assertEqual(self.screen.window_size(), (1170, 2532))
        self.assertEqual(self.screen.screenshot().width, 1170)

    def test_scale_falls_back_to_the_screenshot_when_wda_does_not_say(self):
        def http(port, method, path, body=None, timeout=None):
            if path.endswith("/wda/screen"):
                raise iphone.IphoneError("no such route")
            return self.fake.http(port, method, path, body, timeout)

        with mock.patch.object(iphone, "_http", side_effect=http):
            self.assertEqual(iphone.IphoneScreen("udid-1").scale(), 3.0)

    def test_a_tap_in_pixels_lands_in_points(self):
        self.screen.click(990, 240)
        move = self.actions()[0][0]
        self.assertEqual((move["x"], move["y"]), (330, 80))
        self.assertEqual([step["type"] for step in self.actions()[0]], ["pointerMove", "pointerDown", "pause", "pointerUp"])

    def test_element_click_taps_its_middle(self):
        self.screen(text="Post").click()
        move = self.actions()[0][0]
        self.assertEqual((move["x"], move["y"]), (330, 80))

    def test_a_missing_element_does_not_exist_and_waits_out_its_time(self):
        element = self.screen(text="Nowhere")
        self.assertFalse(element.exists)
        with mock.patch.object(iphone.time, "time", side_effect=[0, 0, 11, 11]):
            self.assertFalse(element.wait(timeout=10))
        with self.assertRaises(iphone.IphoneError):
            element.click()

    def test_back_is_a_swipe_in_from_the_left_edge(self):
        self.screen.press("back")
        steps = self.actions()[0]
        start, end = steps[0], steps[3]
        self.assertLess(start["x"], 1)
        self.assertEqual(start["y"], 422)
        self.assertEqual(end["x"], 156)
        self.assertEqual(end["y"], 422)
        self.assertEqual(end["duration"], 300)
        self.assertEqual([step["type"] for step in steps], ["pointerMove", "pointerDown", "pause", "pointerMove", "pointerUp"])

    def test_recents_swipes_up_from_the_bottom_and_holds(self):
        self.screen.press("recents")
        steps = self.actions()[0]
        self.assertEqual(steps[0]["y"], (2532 - 1) / 3.0)
        self.assertEqual(steps[3]["y"], 2532 * 0.55 / 3.0)
        self.assertEqual(steps[4], {"type": "pause", "duration": 600})

    def test_home_enter_and_delete(self):
        self.screen.press("home")
        self.screen.press("enter")
        self.screen.press("delete")
        self.assertIn(("POST", "/session/S1/wda/homescreen", None), self.fake.calls)
        self.assertIn(("POST", "/session/S1/wda/keys", {"value": ["\n"]}), self.fake.calls)
        self.assertIn(("POST", "/session/S1/wda/keys", {"value": ["\b"]}), self.fake.calls)
        with self.assertRaises(iphone.IphoneError):
            self.screen.press("menu")

    def test_typing_sends_every_character_emoji_included(self):
        self.screen.send_keys("hé \U0001F642")
        self.assertEqual(self.fake.calls[-1], ("POST", "/session/S1/wda/keys", {"value": ["h", "é", " ", "\U0001F642"]}))

    def test_set_text_taps_the_field_erases_it_and_types(self):
        self.screen(resourceId="comment_box").set_text("new words")
        keys = [body["value"] for method, path, body in self.fake.calls if path.endswith("/wda/keys")]
        self.assertEqual(len(self.actions()), 1)
        self.assertEqual(keys[0], ["\b"] * 7)
        self.assertEqual("".join(keys[1]), "new words")

    def test_apps_and_addresses(self):
        self.screen.app_start("com.reddit.Reddit")
        self.screen.app_stop("com.reddit.Reddit")
        self.screen.open_url("https://www.reddit.com/r/test")
        paths = [(method, path) for method, path, body in self.fake.calls]
        self.assertIn(("POST", "/session/S1/wda/apps/launch"), paths)
        self.assertIn(("POST", "/session/S1/wda/apps/terminate"), paths)
        self.assertEqual(self.fake.calls[-1], ("POST", "/session/S1/url", {"url": "https://www.reddit.com/r/test"}))

    def test_the_tree_names_the_app_in_front(self):
        nodes = iphone.nodes_of(self.screen.dump_hierarchy())
        self.assertEqual(nodes[0]["package"], "com.reddit.Reddit")
        self.assertTrue(self.screen(packageName="com.reddit.Reddit", text="Post").exists)

    def test_the_app_in_front(self):
        self.assertEqual(self.screen.active_app(), "com.reddit.Reddit")
        with mock.patch.object(iphone, "_http", side_effect=iphone.IphoneError("no such route")):
            self.assertEqual(self.screen.active_app(), "")

    def test_answers_is_a_live_status_call_and_never_a_remembered_one(self):
        # The window size is remembered after the first call; answers() is not.
        self.screen.window_size()
        self.screen.window_size()
        self.assertEqual(sum(1 for method, path, body in self.fake.calls if path.endswith("/window/size")), 1)
        with mock.patch.dict(iphone._DRIVERS, {"udid-1": {"port": 1}}):
            self.assertTrue(self.screen.answers())
            with mock.patch.object(iphone, "_http", side_effect=iphone.IphoneError("WebDriverAgent did not answer GET /status")):
                self.assertFalse(self.screen.answers())
                # A dead driver, asked again, is still dead: nothing was cached by the yes before.
                self.assertFalse(self.screen.answers())
        status = [(method, path) for method, path, body in self.fake.calls if path == "/status"]
        self.assertEqual(status, [("GET", "/status")])
        # A phone whose driver was never started does not answer either.
        with mock.patch.dict(iphone._DRIVERS, {}, clear=True):
            self.assertFalse(self.screen.answers())

    def test_scrolling_a_table_swipes_inside_it(self):
        self.screen(scrollable=True).scroll.forward()
        steps = self.actions()[0]
        self.assertEqual(steps[0]["x"], 195)
        self.assertGreater(steps[0]["y"], steps[3]["y"])


class SessionTest(unittest.TestCase):
    def setUp(self):
        iphone._SESSIONS.clear()
        iphone._DRIVERS.clear()

    def test_a_dead_session_is_remade_once(self):
        answers = []

        def http(port, method, path, body=None, timeout=None):
            answers.append(path)
            if path == "/session":
                return {"value": {"sessionId": "S%d" % len([one for one in answers if one == "/session"])}}
            if path.startswith("/session/S1/"):
                raise iphone._Refused("invalid session id", "Session does not exist")
            return {"value": "ok"}

        with mock.patch.object(iphone, "_http", side_effect=http), mock.patch.object(iphone, "_port", return_value=1):
            self.assertEqual(iphone._value(iphone._call("u", "GET", "/window/size")), "ok")
        self.assertEqual(answers, ["/session", "/session/S1/window/size", "/session", "/session/S2/window/size"])
        self.assertEqual(iphone._SESSIONS["u"], "S2")

    def test_another_refusal_is_raised_as_is(self):
        def http(port, method, path, body=None, timeout=None):
            if path == "/session":
                return {"value": {"sessionId": "S1"}}
            raise iphone._Refused("no such element", "nothing there")

        with mock.patch.object(iphone, "_http", side_effect=http), mock.patch.object(iphone, "_port", return_value=1):
            with self.assertRaises(iphone.IphoneError):
                iphone._call("u", "GET", "/window/size")


class FakeProcess(object):
    def __init__(self, alive=True):
        self.alive = alive
        self.terminated = False

    def poll(self):
        return None if self.alive else 1

    def terminate(self):
        self.alive = False
        self.terminated = True


class DriverTest(unittest.TestCase):
    def setUp(self):
        iphone._DRIVERS.clear()
        iphone._SESSIONS.clear()
        self.home = tempfile.mkdtemp()
        self.addCleanup(iphone.stop_drivers)
        patch = mock.patch.dict(os.environ, {"PROMO_RACK_HOME": self.home})
        patch.start()
        self.addCleanup(patch.stop)
        self.forward = mock.Mock(side_effect=lambda udid, port, out: FakeProcess())
        for name, value in (("START_FORWARD", self.forward), ("log", mock.Mock())):
            patch = mock.patch.object(iphone, name, value)
            patch.start()
            self.addCleanup(patch.stop)

    def test_a_driver_that_answers_is_a_device(self):
        with mock.patch.object(iphone, "START_DRIVER", lambda udid, out: FakeProcess()), \
                mock.patch.object(iphone, "_status_ok", return_value=True):
            self.assertEqual(iphone.driver_state("u"), "device")
            self.assertEqual(iphone._port("u"), iphone._DRIVERS["u"]["port"])

    def test_a_driver_still_on_its_first_start_counts_as_a_device(self):
        with mock.patch.object(iphone, "START_DRIVER", lambda udid, out: FakeProcess()), \
                mock.patch.object(iphone, "_status_ok", return_value=False):
            self.assertEqual(iphone.driver_state("u"), "device")

    def test_a_driver_that_died_is_no_driver_and_not_restarted_at_once(self):
        starts = mock.Mock(side_effect=lambda udid, out: FakeProcess(alive=False))
        with mock.patch.object(iphone, "START_DRIVER", starts), mock.patch.object(iphone, "_status_ok", return_value=False):
            self.assertEqual(iphone.driver_state("u"), "no_driver")
            self.assertEqual(iphone.driver_state("u"), "no_driver")
            self.assertEqual(starts.call_count, 1)
            with self.assertRaises(iphone.IphoneError):
                iphone._port("u")
            iphone._DRIVERS["u"]["started_at"] -= iphone.DRIVER_RETRY_SECONDS + 1
            self.assertEqual(iphone.driver_state("u"), "no_driver")
            self.assertEqual(starts.call_count, 2)

    def test_a_driver_that_cannot_start_is_no_driver(self):
        def refuse(udid, out):
            raise iphone.IphoneError("WebDriverAgent is not built on this computer.")

        with mock.patch.object(iphone, "START_DRIVER", refuse), mock.patch.object(iphone, "_status_ok", return_value=False):
            self.assertEqual(iphone.driver_state("u"), "no_driver")
            with self.assertRaises(iphone.IphoneError) as raised:
                iphone._port("u")
        self.assertIn("wda.sh", str(raised.exception))

    def test_the_log_is_written_fresh_on_every_start(self):
        log_path = os.path.join(self.home, "wda-u.log")
        with open(log_path, "wb") as handle:
            handle.write(b"x" * 1000)
        starts = mock.Mock(side_effect=lambda udid, out: FakeProcess(alive=False))
        with mock.patch.object(iphone, "START_DRIVER", starts), mock.patch.object(iphone, "_status_ok", return_value=False):
            iphone.driver_state("u")
            self.assertEqual(os.path.getsize(log_path), 0)
            iphone._DRIVERS["u"]["log"].write(b"the first try's words\n")
            iphone._DRIVERS["u"]["log"].flush()
            self.assertGreater(os.path.getsize(log_path), 0)
            iphone._DRIVERS["u"]["started_at"] -= iphone.DRIVER_RETRY_SECONDS + 1
            iphone.driver_state("u")
            self.assertEqual(starts.call_count, 2)
            # The second start began the file again rather than adding to it.
            self.assertEqual(os.path.getsize(log_path), 0)

    def test_an_unplugged_phone_takes_its_driver_with_it(self):
        with mock.patch.object(iphone, "START_DRIVER", lambda udid, out: FakeProcess()), \
                mock.patch.object(iphone, "_status_ok", return_value=True):
            iphone.driver_state("u")
            process = iphone._DRIVERS["u"]["process"]
            iphone.forget_missing(set())
        self.assertTrue(process.terminated)
        self.assertEqual(iphone._DRIVERS, {})


class SignatureTest(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp()
        patch = mock.patch.dict(os.environ, {"PROMO_RACK_HOME": self.home})
        patch.start()
        self.addCleanup(patch.stop)

    def write(self, record):
        with open(os.path.join(self.home, "wda.json"), "w") as handle:
            handle.write(record)

    def test_signed_plus_days(self):
        self.write(json.dumps({"signedAt": "2026-10-18T10:00:00+00:00", "days": 7}))
        self.assertEqual(iphone.wda_expires_at(), "2026-10-25T10:00:00+00:00")

    def test_a_z_time_and_the_default_week(self):
        self.write(json.dumps({"signedAt": "2026-10-18T10:30:00Z"}))
        self.assertEqual(iphone.wda_expires_at(), "2026-10-25T10:30:00+00:00")

    def test_never_signed(self):
        self.assertIsNone(iphone.wda_expires_at())
        self.write("not json")
        self.assertIsNone(iphone.wda_expires_at())
        self.write(json.dumps({"days": 7}))
        self.assertIsNone(iphone.wda_expires_at())


class FakeLockdown(object):
    def __init__(self, disk=None, fail=False):
        self.disk = disk
        self.fail = fail
        self.closed = False

    def get_value(self, domain=None, key=None):
        if self.fail:
            raise RuntimeError("the phone did not answer")
        return self.disk

    def close(self):
        self.closed = True


class FakeDiagnostics(object):
    def __init__(self, battery=None, info=None, refuse_restart=False):
        self.battery, self.info_record = battery, info
        self.refuse_restart = refuse_restart
        self.restarted = False

    def restart(self):
        if self.refuse_restart:
            raise RuntimeError("the phone said no")
        self.restarted = True

    def get_battery(self):
        if self.battery is None:
            raise RuntimeError("no battery service")
        return self.battery

    def info(self):
        if self.info_record is None:
            raise RuntimeError("no info")
        return self.info_record


class VitalsTest(unittest.TestCase):
    def test_reads_battery_heat_and_storage_and_never_guesses_signal(self):
        lockdown = FakeLockdown(disk={"TotalDataCapacity": 100 * 10 ** 9, "TotalDataAvailable": 37 * 10 ** 9})
        diagnostics = FakeDiagnostics(battery={"CurrentCapacity": 67, "MaxCapacity": 100, "Temperature": 2787}, info={"Uptime": 86400.5})
        with mock.patch.object(iphone, "_open_lockdown", return_value=lockdown), \
                mock.patch.object(iphone, "_diagnostics", return_value=diagnostics):
            reading = iphone.vitals("u")
        self.assertEqual(reading, {
            "batteryPercent": 67, "temperatureC": 27.9, "storageUsedPercent": 63,
            "signal": "not_reported", "upSeconds": 86400, "apps": None,
        })
        self.assertTrue(lockdown.closed)

    def test_what_cannot_be_read_is_none(self):
        lockdown = FakeLockdown(fail=True)
        with mock.patch.object(iphone, "_open_lockdown", return_value=lockdown), \
                mock.patch.object(iphone, "_diagnostics", return_value=FakeDiagnostics()), \
                mock.patch.object(iphone, "log"):
            reading = iphone.vitals("u")
        self.assertEqual(reading, {
            "batteryPercent": None, "temperatureC": None, "storageUsedPercent": None,
            "signal": "not_reported", "upSeconds": None, "apps": None,
        })

    def test_a_phone_that_cannot_be_opened_gives_an_empty_reading(self):
        with mock.patch.object(iphone, "_open_lockdown", side_effect=iphone._NotTrusted("locked")), mock.patch.object(iphone, "log"):
            reading = iphone.vitals("u")
        self.assertIsNone(reading["batteryPercent"])
        self.assertEqual(reading["signal"], "not_reported")

    def test_battery_in_milliamp_hours_and_other_temperature_units(self):
        self.assertEqual(iphone._battery_percent({"CurrentCapacity": 1523, "MaxCapacity": 2000}), 76)
        self.assertEqual(iphone._battery_percent({"CurrentCapacity": 55}), 55)
        self.assertIsNone(iphone._battery_percent({}))
        self.assertEqual(iphone._battery_temperature({"Temperature": 301}), 30.1)
        self.assertEqual(iphone._battery_temperature({"Temperature": 29}), 29.0)
        self.assertIsNone(iphone._battery_temperature({}))


class RestartTest(unittest.TestCase):
    def test_restarts_through_diagnostics_and_forgets_the_session(self):
        lockdown, diagnostics = FakeLockdown(), FakeDiagnostics()
        iphone._SESSIONS["u"] = "S1"
        with mock.patch.object(iphone, "_open_lockdown", return_value=lockdown), \
                mock.patch.object(iphone, "_diagnostics", return_value=diagnostics):
            iphone.restart("u")
        self.assertTrue(diagnostics.restarted)
        self.assertTrue(lockdown.closed)
        self.assertNotIn("u", iphone._SESSIONS)

    def test_says_in_words_when_it_cannot(self):
        with mock.patch.object(iphone, "_open_lockdown", side_effect=iphone._NotTrusted("locked")):
            with self.assertRaises(iphone.IphoneError) as raised:
                iphone.restart("u")
        self.assertIn("not trusted or is locked", str(raised.exception))
        with mock.patch.object(iphone, "_open_lockdown", return_value=FakeLockdown()), \
                mock.patch.object(iphone, "_diagnostics", return_value=FakeDiagnostics(refuse_restart=True)):
            with self.assertRaises(iphone.IphoneError) as raised:
                iphone.restart("u")
        self.assertIn("refused the restart", str(raised.exception))


class FakeInstallationProxy(object):
    def __init__(self, apps):
        self.apps = apps

    def get_apps(self, application_type="User", calculate_sizes=False):
        if self.apps is None:
            raise RuntimeError("installation proxy closed")
        return self.apps


class AppVersionsTest(unittest.TestCase):
    def setUp(self):
        iphone._NO_VERSIONS_LOGGED.clear()

    def test_reads_the_tracked_apps_and_leaves_out_the_rest(self):
        apps = {
            "com.reddit.Reddit": {"CFBundleIdentifier": "com.reddit.Reddit", "CFBundleShortVersionString": "2026.40.0"},
            "com.zhiliaoapp.musically": {"CFBundleIdentifier": "com.zhiliaoapp.musically", "CFBundleShortVersionString": "42.1.0"},
            "com.apple.Maps": {"CFBundleIdentifier": "com.apple.Maps", "CFBundleShortVersionString": "3.0"},
        }
        with mock.patch.object(iphone, "_open_lockdown", return_value=FakeLockdown()), \
                mock.patch.object(iphone, "_installation_proxy", return_value=FakeInstallationProxy(apps)):
            self.assertEqual(iphone.app_versions("u"), {"reddit": "2026.40.0", "tiktok": "42.1.0"})
        # Older pymobiledevice3 answers a list instead of a dict.
        with mock.patch.object(iphone, "_open_lockdown", return_value=FakeLockdown()), \
                mock.patch.object(iphone, "_installation_proxy", return_value=FakeInstallationProxy(list(apps.values()))):
            self.assertEqual(iphone.app_versions("u"), {"reddit": "2026.40.0", "tiktok": "42.1.0"})

    def test_never_raises_and_logs_once(self):
        logged = mock.Mock()
        with mock.patch.object(iphone, "log", logged), \
                mock.patch.object(iphone, "_open_lockdown", return_value=FakeLockdown()), \
                mock.patch.object(iphone, "_installation_proxy", return_value=FakeInstallationProxy(None)):
            # None is "not read"; {} would read as "none of the apps is installed".
            self.assertIsNone(iphone.app_versions("u"))
            self.assertIsNone(iphone.app_versions("u"))
        self.assertEqual(logged.call_count, 1)
        with mock.patch.object(iphone, "log", logged), \
                mock.patch.object(iphone, "_open_lockdown", side_effect=iphone._NotTrusted("locked")):
            self.assertIsNone(iphone.app_versions("other"))
        self.assertEqual(logged.call_count, 2)


if __name__ == "__main__":
    unittest.main()
