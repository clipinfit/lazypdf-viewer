import { serve } from "bun";
import index from "./index.html";
import sj from "./sj.html";

const server = serve({
  routes: {
    // Serve the PDF.js worker file as a static file
    "/pdf.worker.min.mjs": new Response(
      Bun.file(import.meta.dir + "/pdf.worker.min.mjs")
    ),

    // Serve images from the images directory
    "/images/:filename": (req) => {
      const filename = req.params.filename;
      return new Response(Bun.file(import.meta.dir + "/images/" + filename));
    },

    // Serve index.html for all unmatched routes.
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
