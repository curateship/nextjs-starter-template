import { defineHandler } from "nitro"

import { publicFontResponse } from "@/server/media/public-font"

export default defineHandler((event) => publicFontResponse(event.req))
