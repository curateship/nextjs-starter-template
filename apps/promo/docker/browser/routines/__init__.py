"""Every network the browser knows how to drive.

One module per network, each exposing a ``ROUTINES`` dict of the things it can
be asked to do. They are gathered here under a prefixed name — ``reddit.search``
rather than ``search`` — so two networks can both have a routine called
``search`` and the command server still knows which one was meant.

Adding a network is adding a file beside ``reddit.py`` and a line to the list
below. Nothing else changes: not the launcher, not the command server, not the
image.
"""

from . import browser, reddit

# "browser" is not a network. Its routines read what the browser itself gives
# away, for any profile, and sit here so they ride the same command port.
NETWORKS = {
    "browser": browser,
    "reddit": reddit,
}

# The flat map the command server looks a request up in. A name not in here is
# refused, which is what stops the port being used to drive the browser
# anywhere its owner did not intend.
ROUTINES = {
    f"{name}.{routine}": handler
    for name, module in NETWORKS.items()
    for routine, handler in module.ROUTINES.items()
}
