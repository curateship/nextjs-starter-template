# Phemex refusals

Trade gives the Phemex refusal codes seen in this app a plain sentence and a
next step.

- 11150 says the market's open interest has reached Phemex's cap. Wait for
  space or place an order that closes a position.
- 39108 says the leverage is not allowed or the two sides disagree. Use a
  legal leverage and the same setting for both sides.
- 20004 says the account is in hedged position mode. Switch the market to
  one-way mode.
- 11043 says a stop is already on the side that would fire. Move it past the
  current price.
- 10002 says the order is no longer open. Refresh before changing it again.
- Authentication, request limits and unavailable-server answers have their
  own sentences too.

An unknown code keeps Phemex's own scrubbed words. The list came from refused
Journal rows in the 30 days ending 24 August 2026. That journal contained all
five numbered codes above.
