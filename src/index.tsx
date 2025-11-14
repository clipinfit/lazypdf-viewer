import { serve } from "bun";
import index from "./index.html";

// Document ID - can be made configurable or read from environment
const DOCUMENT_ID = "js7b8vcjdrc34hn7yb1j21gmx57vc6qr";
const DOCUMENTS_DIR = import.meta.dir + "/documents/" + DOCUMENT_ID;

const server = serve({
  port: 8082,
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

    // Serve manifest.json
    "/manifest.json": async () => {
      const manifestFile = Bun.file(DOCUMENTS_DIR + "/manifest.json");
      return new Response(manifestFile);
    },

    "/original.pdf": async () => {
      const pdfFile = Bun.file(DOCUMENTS_DIR + "/original.pdf");
      return new Response(pdfFile, {
        headers: {
          "Content-Type": "application/pdf",
        },
      });
    },

    // Serve PDF pages - e.g., /pages/1.pdf
    // Use a function route to handle the path matching manually
    "/pages/*": async (req) => {
      // Extract page number from URL pathname (handles /pages/1.pdf)
      const urlPath = new URL(req.url).pathname;
      const match = urlPath.match(/\/pages\/(\d+)\.pdf$/);
      if (!match) {
        return new Response("Invalid page URL", { status: 400 });
      }
      const pageNum = match[1];
      const pageFile = Bun.file(DOCUMENTS_DIR + "/pages/" + pageNum + ".pdf");
      if (await pageFile.exists()) {
        return new Response(pageFile, {
          headers: {
            "Content-Type": "application/pdf",
          },
        });
      }
      return new Response("Page not found", { status: 404 });
    },

    // Serve index.html for all unmatched routes
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
