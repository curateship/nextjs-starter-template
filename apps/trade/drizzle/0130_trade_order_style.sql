-- Whether a plain order rests on the exchange or is watched by the engine.
--
-- Resting is what every order has done until now and stays the default: it
-- fills whether or not this app is running. Watching keeps the level here,
-- sends nothing until the market reaches it, and then chases a post-only order
-- into the trade — no money tied up in the meantime, and nothing on the book
-- for anybody else to read.
--
-- A choice rather than a replacement, because the two fail in opposite
-- directions: a resting order can be picked off while nobody is looking, and a
-- watched one does nothing at all while the engine is switched off.
ALTER TABLE "trade_prefs"
  ADD COLUMN IF NOT EXISTS "order_style" varchar(8) DEFAULT 'rest' NOT NULL;
