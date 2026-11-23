# When a wallet turn gets stuck

The trading engine remembers when each wallet starts its turn. A wallet that is
still working two minutes later puts a red error on Settings > Trading engine.
The error names the wallet and says how many minutes the turn has been running.

Two minutes leaves room for a slow exchange without hiding a real failure. The
slowest measured normal turn took about 14 seconds for a KuCoin wallet carrying
454 markets. The warning waits more than eight times that long.

If several wallets pass the two-minute line together, the error gives the total
and names the first one. The written error appears with the red treatment, so
the warning does not rely on colour alone.

The engine checks the timers on each one-second pass. Its heartbeat reaches the
screen every five seconds, and the open screen refreshes every five seconds. A
new warning can therefore take about ten seconds after the two-minute line to
appear.

The warning does not cancel the turn or start it again. A turn can be midway
through placing an order, so recovery needs a separate decision. When the stuck
wallet finishes successfully, the engine removes its timer and clears the
warning. If the turn finishes with an error, the screen shows that error
instead. Removing or switching off the wallet also removes its timer on the
next pass.
