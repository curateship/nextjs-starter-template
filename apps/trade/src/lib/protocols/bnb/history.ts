/**
 * Contract addresses checked on 8 Sep 2026 against PancakeSwap's extended
 * BNB list, unique vetted tickers, active Binance USDT perpetuals, and the
 * most liquid DexScreener base-token pool with over $200,000 liquidity.
 * Recheck all four before adding an address. Names alone never qualify.
 * Binance listings are checked again by resolveHistorySource at read time.
 */
export const BNB_BINANCE_HISTORY: Readonly<Record<string, string>> = {
  // 4: $1,661,385.15 liquidity
  "0x0a43fc31a73013089df59194872ecae4cae14444": "4",
  // ADA: $487,821.24 liquidity
  "0x3ee2200efb3400fabb9aacf31297cbdd1d435d47": "ADA",
  // AGT: $1,417,967.62 liquidity
  "0x5dbde81fce337ff4bcaaee4ca3466c00aecae274": "AGT",
  // AIN: $1,537,230.27 liquidity
  "0x9558a9254890b2a8b057a789f413631b9084f4a3": "AIN",
  // AIOT: $1,185,559.76 liquidity
  "0x55ad16bd573b3365f43a9daeb0cc66a73821b4a5": "AIOT",
  // AKE: $2,148,345.62 liquidity
  "0x2c3a8ee94ddd97244a93bc48298f97d2c412f7db": "AKE",
  // ARIA: $1,284,244.13 liquidity
  "0x5d3a12c42e5372b2cc3264ab3cdcf660a1555238": "ARIA",
  // ASTER: $318,337.85 liquidity
  "0x000ae314e2a2172a039b26378814c252734f556a": "ASTER",
  // AT: $1,270,728.44 liquidity
  "0x9be61a38725b265bc3eb7bfdf17afdfc9d26c130": "AT",
  // B: $2,746,390.53 liquidity
  "0x6bdcce4a559076e37755a78ce0c06214e59e4444": "B",
  // B2: $765,572.64 liquidity
  "0x783c3f003f172c6ac5ac700218a357d2d66ee2a2": "B2",
  // BAS: $2,161,420.12 liquidity
  "0x0f0df6cb17ee5e883eddfef9153fc6036bdb4e37": "BAS",
  // BIO: $387,467.39 liquidity
  "0x226a2fa2556c48245e57cd1cba4c6c9e67077dd2": "BIO",
  // BLESS: $247,066.66 liquidity
  "0x7c8217517ed4711fe2deccdfeffe8d906b9ae11f": "BLESS",
  // BLUAI: $709,956.40 liquidity
  "0xed9ae3def8d6f052971bb8b6d1975ff267cf9aad": "BLUAI",
  // BMT: $362,725.45 liquidity
  "0x7d814b9ed370ec0a502edc3267393bf62d891b62": "BMT",
  // BNB: $12,059,035.24 liquidity
  "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": "BNB",
  // BR: $1,414,352.93 liquidity
  "0xff7d6a96ae471bbcd7713af9cb1feeb16cf56b41": "BR",
  // C98: $296,611.48 liquidity
  "0xaec945e04baf28b135fa7c640f624f8d90f1c3a6": "C98",
  // CAKE: $1,035,444.59 liquidity
  "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82": "CAKE",
  // CGPT: $979,633.23 liquidity
  "0x9840652dc04fb9db2c43853633f0f62be6f00f98": "CGPT",
  // COAI: $1,904,066.97 liquidity
  "0x0a8d6c86e1bce73fe4d0bd531e1a567306836ea5": "COAI",
  // COOKIE: $235,681.50 liquidity
  "0xc0041ef357b183448b235a8ea73ce4e4ec8c265f": "COOKIE",
  // CROSS: $1,088,695.93 liquidity
  "0x6bf62ca91e397b5a7d1d6bce97d9092065d7a510": "CROSS",
  // DOGE: $307,571.74 liquidity
  "0xba2ae424d960c26247dd6c32edc70b295c744c43": "DOGE",
  // DOS: $833,224.52 liquidity
  "0xb0f09ea9ae0515c3551080d4a745c8115aa30e37": "DOS",
  // ETH: $789,586.05 liquidity
  "0x2170ed0880ac9a755fd29b2688956bd959f933f8": "ETH",
  // FF: $4,328,773.64 liquidity
  "0xac23b90a79504865d52b49b327328411a23d4db2": "FF",
  // FHE: $1,002,135.35 liquidity
  "0xd55c9fb62e176a8eb6968f32958fefdd0962727e": "FHE",
  // GIGGLE: $880,316.78 liquidity
  "0x20d6015660b3fe52e6690a889b5c51f69902ce0e": "GIGGLE",
  // HANA: $1,110,016.46 liquidity
  "0x6261963ebe9ff014aad10ecc3b0238d4d04e8353": "HANA",
  // HEMI: $417,309.47 liquidity
  "0x5ffd0eadc186af9512542d0d5e5eafc65d5afc5b": "HEMI",
  // HOLO: $529,184.03 liquidity
  "0x1a5d7e4c3a7f940b240b7357a4bfed30d17f9497": "HOLO",
  // IDOL: $951,865.02 liquidity
  "0x3b4de3c7855c03bb9f50ea252cd2c9fa1125ab07": "IDOL",
  // IN: $1,144,113.08 liquidity
  "0x61fac5f038515572d6f42d4bcb6b581642753d50": "IN",
  // IRYS: $381,732.00 liquidity
  "0x91152b4ef635403efbae860edd0f8c321d7c035d": "IRYS",
  // KAVA: $430,791.24 liquidity
  "0x9bafc8d4b487cebff201721702507a3e2c67ad79": "KAVA",
  // KOMA: $2,296,234.67 liquidity
  "0xd5eaaac47bd1993d661bc087e15dfb079a7f3c19": "KOMA",
  // LINK: $1,160,537.62 liquidity
  "0xf8a0bf9cf54bb92f17374d9e9a321e6a111a51bd": "LINK",
  // MERL: $214,601.49 liquidity
  "0xa0c56a8c0692bd10b3fa8f8ba79cf5332b7107f9": "MERL",
  // MIRA: $225,587.75 liquidity
  "0x7839fbfd09dae4d0f15bfb36b8f16f7898fbe684": "MIRA",
  // MYX: $250,116.78 liquidity
  "0xd82544bf0dfe8385ef8fa34d67e6e4940cc63e16": "MYX",
  // O: $2,638,925.23 liquidity
  "0x500a02a20b0b0a3f3efccfc0559543f5743bd1c4": "O",
  // ON: $1,091,124.12 liquidity
  "0x0e4f6209ed984b21edea43ace6e09559ed051d48": "ON",
  // OPEN: $450,640.76 liquidity
  "0xa227cc36938f0c9e09ce0e64dfab226cad739447": "OPEN",
  // ORDER: $287,802.01 liquidity
  "0x4e200fe2f3efb977d5fd9c430a41531fb04d97b8": "ORDER",
  // PARTI: $307,006.81 liquidity
  "0x59264f02d301281f3393e1385c0aefd446eb0f00": "PARTI",
  // PENDLE: $727,882.60 liquidity
  "0xb3ed0a426155b79b898849803e3b36552f7ed507": "PENDLE",
  // Q: $1,040,219.82 liquidity
  "0xc07e1300dc138601fa6b0b59f8d0fa477e690589": "Q",
  // SFP: $806,789.43 liquidity
  "0xd41fdb03ba84762dd66a0af1a6c8540ff1ba5dfb": "SFP",
  // SIGN: $234,792.72 liquidity
  "0x868fced65edbf0056c4163515dd840e9f287a4c3": "SIGN",
  // SIREN: $2,392,469.89 liquidity
  "0x997a58129890bbda032231a52ed1ddc845fc18e1": "SIREN",
  // SKYAI: $6,672,109.68 liquidity
  "0x92aa03137385f18539301349dcfc9ebc923ffb10": "SKYAI",
  // SOL: $1,322,407.95 liquidity
  "0x570a5d26f7765ecb712c0924e4de545b89fd43df": "SOL",
  // SOON: $580,135.80 liquidity
  "0xb9e1fd5a02d3a33b25a14d661414e6ed6954a721": "SOON",
  // SOPH: $284,602.55 liquidity
  "0x31dba3c96481fde3cd81c2aaf51f2d8bf618c742": "SOPH",
  // SQD: $419,753.78 liquidity
  "0xe50e3d1a46070444f44df911359033f2937fcc13": "SQD",
  // STABLE: $902,595.25 liquidity
  "0x011ebe7d75e2c9d1e0bd0be0bef5c36f0a90075f": "STABLE",
  // STAR: $1,348,628.64 liquidity
  "0x8fce7206e3043dd360f115afa956ee31b90b787c": "STAR",
  // STBL: $1,700,752.10 liquidity
  "0x8dedf84656fa932157e27c060d8613824e7979e3": "STBL",
  // TA: $248,987.79 liquidity
  "0x539ae81a166e5e80aed211731563e549c411b140": "TA",
  // TAG: $2,256,913.37 liquidity
  "0x208bf3e7da9639f1eaefa2de78c23396b0682025": "TAG",
  // TAKE: $432,935.15 liquidity
  "0xe747e54783ba3f77a8e5251a3cba19ebe9c0e197": "TAKE",
  // TOSHI: $409,221.44 liquidity
  "0x6a2608dabe09bc1128eec7275b92dfb939d5db3f": "TOSHI",
  // TRADOOR: $853,549.27 liquidity
  "0x9123400446a56176eb1b6be9ee5cf703e409f492": "TRADOOR",
  // TST: $913,264.53 liquidity
  "0x86bb94ddd16efc8bc58e6b056e8df71d9e666429": "TST",
  // TUT: $2,929,499.25 liquidity
  "0xcaae2a2f939f51d97cdfa9a86e79e3f085b799f3": "TUT",
  // TWT: $594,660.89 liquidity
  "0x4b0f1812e5df2a09796481ff14017e6005508003": "TWT",
  // UB: $3,797,711.25 liquidity
  "0x40b8129b786d766267a7a118cf8c07e31cdb6fde": "UB",
  // USELESS: $869,137.19 liquidity
  "0xba38b3c706f7a515ff7c8db04daa0a134ec46d2b": "USELESS",
  // VELVET: $612,513.68 liquidity
  "0x8b194370825e37b33373e74a41009161808c1488": "VELVET",
  // XAN: $461,956.13 liquidity
  "0x7427bd9542e64d1ac207a540cfce194b7390a07f": "XAN",
  // XNY: $728,182.39 liquidity
  "0xe3225e11cab122f1a126a28997788e5230838ab9": "XNY",
  // XPIN: $733,143.75 liquidity
  "0xd955c9ba56fb1ab30e34766e252a97ccce3d31a6": "XPIN",
  // XPL: $417,792.03 liquidity
  "0x405fbc9004d857903bfd6b3357792d71a50726b0": "XPL",
  // XRP: $283,174.48 liquidity
  "0x1d2f0da169ceb9fc7b3144628db156f3f6c60dbe": "XRP",
  // XVS: $269,975.58 liquidity
  "0xcf6bb5389c92bdda8a3747ddb454cb7a64626c63": "XVS",
  // ZEC: $859,929.41 liquidity
  "0x1ba42e5193dfa8b03d15dd1b86a3113bbbef8eeb": "ZEC",
}

export function bnbBorrowedCoin(address: string): string | null {
  return BNB_BINANCE_HISTORY[address.toLowerCase()] ?? null
}
