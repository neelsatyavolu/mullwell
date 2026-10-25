import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mullwell",
    short_name: "Mullwell",
    description: "An all-in-one study app that quizzes you on your own class notes.",
    start_url: "/",
    display: "standalone",
    background_color: "#F6F3EC",
    theme_color: "#3D7A57",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
