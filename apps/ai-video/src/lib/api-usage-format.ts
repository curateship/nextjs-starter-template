export const apiUsageFeatureLabels: Record<string, string> = {
  text_generation: "Text generation",
  caption_generation: "Captions",
  video_analysis: "Video analysis",
  voiceover: "Voiceover",
  image_generation: "Image generation",
  ai_video_generation: "AI video",
  script_generation: "Script",
  carousel_generation: "Carousel",
  export_description: "Export caption",
}

export function formatApiUsageFeature(feature: string) {
  return apiUsageFeatureLabels[feature] ?? feature
}
