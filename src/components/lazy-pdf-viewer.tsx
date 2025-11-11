import { useEffect, useMemo, useRef, useState } from "react";
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  RefProxy,
  DocumentInitParameters,
} from "pdfjs-dist/types/src/display/api";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import {
  EventBus,
  PDFViewer,
  PDFLinkService,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import "../../node_modules/pdfjs-dist/web/pdf_viewer.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const ZOOM_PRESET_OPTIONS = [
  { value: "auto", label: "Automatic Zoom" },
  { value: "page-actual", label: "Actual Size" },
  { value: "page-fit", label: "Page Fit" },
  { value: "page-width", label: "Page Width" },
] as const;

const ZOOM_PERCENTAGE_OPTIONS = [
  { value: "0.5", label: "50%" },
  { value: "0.75", label: "75%" },
  { value: "1", label: "100%" },
  { value: "1.25", label: "125%" },
  { value: "1.5", label: "150%" },
  { value: "2", label: "200%" },
  { value: "3", label: "300%" },
  { value: "4", label: "400%" },
] as const;

const MAX_SCALE = 5;
const MIN_SCALE = 0.1;

const CHUNKED_LOAD_OPTIONS: DocumentInitParameters = {
  disableAutoFetch: true,
  disableStream: false,
  disableRange: false,
  rangeChunkSize: 65536,
};

const SINGLE_REQUEST_LOAD_OPTIONS: DocumentInitParameters = {
  disableAutoFetch: true,
  disableStream: true,
  disableRange: true,
};

type ManifestPage = {
  n: number;
  w: number;
  h: number;
  pdfUrl: string;
};

type Manifest = {
  docId: string;
  filename: string;
  pageCount: number;
  recommendedMaxWidth?: number;
  createdAt?: string;
  originalUrl?: string;
  pages: ManifestPage[];
};

type NamedDestination = {
  dest: unknown;
  pageNumber: number;
};

const refKey = (ref: RefProxy | null | undefined): string | null => {
  if (!ref || typeof ref !== "object") return null;
  return `${ref.num}:${ref.gen}`;
};

class LazyPDFDocument {
  private manifest: Manifest;
  private pageDocCache = new Map<number, PDFDocumentProxy>();
  private pageDocLoading = new Map<number, Promise<PDFDocumentProxy>>();
  private pageProxyCache = new Map<number, PDFPageProxy>();
  private refToPageMap = new Map<string, number>();
  private namedDestinations = new Map<string, NamedDestination>();
  private scannedDestPages = new Set<number>();
  private _fingerprints: [string, string | null];
  private _annotationStorage = {
    resetModifiedIds: () => {
      /* no-op */
    },
  };
  private _filterFactory = {
    addHighlightHCMFilter: () => "none",
  };
  private optionalContentConfigPromiseCache = new Map<string, Promise<any>>();
  private loadOptions: DocumentInitParameters;

  constructor(manifest: Manifest, loadOptions: DocumentInitParameters) {
    this.manifest = manifest;
    this._fingerprints = [manifest.docId, null];
    this.loadOptions = loadOptions;
  }

  get numPages(): number {
    return this.manifest.pageCount;
  }

  get fingerprints(): [string, string | null] {
    return this._fingerprints;
  }

  get annotationStorage() {
    return this._annotationStorage;
  }

  get filterFactory() {
    return this._filterFactory;
  }

  get loadingParams() {
    return this.loadOptions;
  }

  get isPureXfa(): boolean {
    return false;
  }

  get allXfaHtml(): null {
    return null;
  }

  async getPage(pageNumber: number): Promise<PDFPageProxy> {
    const cachedPage = this.pageProxyCache.get(pageNumber);
    if (cachedPage) {
      return cachedPage;
    }

    const manifestEntry = this.manifest.pages[pageNumber - 1];
    if (!manifestEntry) {
      throw new Error(`Page ${pageNumber} not found in manifest`);
    }

    const doc = await this.loadDocumentForPage(
      pageNumber,
      manifestEntry.pdfUrl
    );
    const page = await doc.getPage(1);

    // Store the page reference for internal link resolution
    const pageWithRef = page as PDFPageProxy & {
      ref?: RefProxy | null;
      _pageInfo?: { ref?: RefProxy | null };
    };
    const ref = refKey(pageWithRef.ref ?? pageWithRef._pageInfo?.ref ?? null);
    if (ref) {
      this.refToPageMap.set(ref, pageNumber);
    }

    this.pageProxyCache.set(pageNumber, page);
    return page;
  }

  async getPageIndex(ref: RefProxy): Promise<number> {
    const key = refKey(ref);
    if (!key) return 0;
    const cached = this.refToPageMap.get(key);
    if (cached !== undefined) {
      return cached - 1;
    }

    for (const { n, pdfUrl } of this.manifest.pages) {
      await this.loadDocumentForPage(n, pdfUrl);
      const mapped = this.refToPageMap.get(key);
      if (mapped !== undefined) {
        return mapped - 1;
      }
    }

    return 0;
  }

  cachedPageNumber(ref: RefProxy): number | null {
    const key = refKey(ref);
    if (!key) return null;
    return this.refToPageMap.get(key) ?? null;
  }

  async getDestinations(): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const [name, { dest }] of this.namedDestinations.entries()) {
      result[name] = dest;
    }
    return result;
  }

  async getDestination(name: string): Promise<unknown> {
    const cachedDest = this.namedDestinations.get(name);
    if (cachedDest) {
      return cachedDest.dest;
    }

    for (const { n, pdfUrl } of this.manifest.pages) {
      await this.ensureDestinationsForPage(n, pdfUrl);
      const found = this.namedDestinations.get(name);
      if (found) {
        return found.dest;
      }
    }

    return null;
  }

  async getPageLabels(): Promise<string[] | null> {
    return null;
  }

  async getOutline(): Promise<null> {
    return null;
  }

  async getPermissions(): Promise<null> {
    return null;
  }

  async getMetadata() {
    return {
      info: {
        Title: this.manifest.filename,
        Author: "",
        Subject: "",
        Keywords: "",
        Creator: "",
        Producer: "",
        CreationDate: this.manifest.createdAt || "",
        ModDate: "",
      },
      metadata: null,
      contentDispositionFilename: this.manifest.filename,
      contentLength: null,
    };
  }

  async getAttachments(): Promise<null> {
    return null;
  }

  async getJavaScript(): Promise<null> {
    return null;
  }

  async getFieldObjects(): Promise<null> {
    return null;
  }

  async getCalculationOrderIds(): Promise<null> {
    return null;
  }

  async hasJSActions(): Promise<boolean> {
    return false;
  }

  async getPageMode(): Promise<null> {
    return null;
  }

  async getPageLayout(): Promise<null> {
    return null;
  }

  async getViewerPreferences(): Promise<null> {
    return null;
  }

  async getOpenActionDestination(): Promise<null> {
    return null;
  }

  async getOptionalContentConfig(params?: { intent?: string }): Promise<any> {
    const intent = params?.intent || "display";

    // Map PDF.js intent strings to RenderingIntentFlag bitmask
    const intentFlag =
      intent === "print" ? 0x04 /* PRINT */ : 0x02; /* DISPLAY */

    if (this.optionalContentConfigPromiseCache.has(intent)) {
      return this.optionalContentConfigPromiseCache.get(intent);
    }

    const config = {
      // IMPORTANT: PDF.js checks this bitmask against the page render intent
      renderingIntent: intentFlag,
      hasInitialVisibility: true,
      setOCGState: () => {},
      getOrder: () => null,
      getRBGroups: () => null,
      getOCGs: () => [],
      ensureLayers: () => {},
      getGroup: () => null,
      setVisibility: () => {},
      getHash: () => "",
    };

    const promise = Promise.resolve(config);
    this.optionalContentConfigPromiseCache.set(intent, promise);
    return promise;
  }

  async getDownloadInfo(): Promise<{ length: number }> {
    return { length: 0 };
  }

  async getData(): Promise<Uint8Array> {
    return new Uint8Array();
  }

  async saveDocument(): Promise<Uint8Array> {
    return new Uint8Array();
  }

  cleanup(): void {
    for (const doc of this.pageDocCache.values()) {
      doc.cleanup?.();
      doc.destroy?.();
    }
    this.pageProxyCache.clear();
    this.pageDocCache.clear();
    this.refToPageMap.clear();
    this.namedDestinations.clear();
    this.scannedDestPages.clear();
  }

  destroy(): void {
    this.cleanup();
  }

  private async loadDocumentForPage(
    pageNumber: number,
    pdfUrl: string
  ): Promise<PDFDocumentProxy> {
    let doc = this.pageDocCache.get(pageNumber);
    if (doc) {
      return doc;
    }

    const inFlight = this.pageDocLoading.get(pageNumber);
    if (inFlight) {
      return inFlight;
    }

    const promise = (async () => {
      const loadingTask = pdfjsLib.getDocument({
        url: pdfUrl,
        ...this.loadOptions,
      });
      const loadedDoc = await loadingTask.promise;
      this.pageDocCache.set(pageNumber, loadedDoc);
      try {
        await this.ensureDestinationsForPage(pageNumber, pdfUrl, loadedDoc);
      } finally {
        this.pageDocLoading.delete(pageNumber);
      }
      return loadedDoc;
    })();

    this.pageDocLoading.set(pageNumber, promise);
    return promise;
  }

  private async ensureDestinationsForPage(
    pageNumber: number,
    pdfUrl: string,
    doc?: PDFDocumentProxy
  ): Promise<void> {
    if (this.scannedDestPages.has(pageNumber)) {
      return;
    }

    this.scannedDestPages.add(pageNumber);
    let pdfDoc = doc;
    if (!pdfDoc) {
      pdfDoc = await this.loadDocumentForPage(pageNumber, pdfUrl);
    }

    try {
      const destinations = (await pdfDoc.getDestinations()) as Record<
        string,
        unknown[]
      > | null;
      if (destinations) {
        for (const [name, dest] of Object.entries(destinations)) {
          if (!this.namedDestinations.has(name)) {
            const destArray = Array.isArray(dest) ? dest : [];
            const ref =
              destArray.length > 0 ? refKey(destArray[0] as RefProxy) : null;
            if (ref) {
              this.refToPageMap.set(ref, pageNumber);
            }
            this.namedDestinations.set(name, { dest, pageNumber });
          }
        }
      }
    } catch {
      // Ignore destination loading errors for individual pages.
    }
  }
}

interface LazyPDFViewerProps {
  manifestUrl: string;
  useRangeRequests?: boolean;
}

type PageChangingEvent = {
  pageNumber: number;
};

type ScaleChangingEvent = {
  scale: number;
  presetValue?: string;
};
const percentageValues = new Set(
  ZOOM_PERCENTAGE_OPTIONS.map((item) =>
    Number.parseFloat(item.value).toFixed(2)
  )
);

const knownZoomValues = new Set<string>([
  ...ZOOM_PRESET_OPTIONS.map((option) => option.value),
  ...ZOOM_PERCENTAGE_OPTIONS.map((option) => option.value),
  "custom",
]);

/**
 * Calculates the next zoom scale by rounding to the nearest 10% and adjusting by 10%.
 * @param currentScale - The current zoom scale (e.g., 1.15 for 115%)
 * @param direction - 1 for zoom in, -1 for zoom out
 * @returns The next zoom scale clamped between MIN_SCALE and MAX_SCALE
 */
function calculateNextZoomScale(
  currentScale: number,
  direction: 1 | -1
): number {
  // Convert current scale to percentage, round to nearest 10, adjust by 10, convert back
  const currentPercent = currentScale * 100;
  const roundedPercent = Math.round(currentPercent / 10) * 10;
  const nextPercent = roundedPercent + direction * 10;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextPercent / 100));
}

export function LazyPDFViewer({
  manifestUrl,
  useRangeRequests = false,
}: LazyPDFViewerProps) {
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PDFViewer | null>(null);
  const lazyDocRef = useRef<LazyPDFDocument | null>(null);
  const eventBusRef = useRef<EventBus | null>(null);

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState<number>(1);
  const [scalePreset, setScalePreset] = useState<string>("auto");

  useEffect(() => {
    console.log("Loading manifest from:", manifestUrl);
    setLoading(true);
    setError(null);

    fetch(manifestUrl)
      .then((res) => {
        console.log("Manifest response:", res.status);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return res.json();
      })
      .then((data: Manifest) => {
        console.log("Manifest loaded:", data);
        setManifest(data);
        setPageCount(data.pageCount);
        setPageNum(1);
      })
      .catch((err) => {
        console.error("Failed to load manifest:", err);
        setError(err?.message || "Failed to load manifest");
        setLoading(false);
      });
  }, [manifestUrl]);

  useEffect(() => {
    if (!manifest) {
      console.log("Skipping viewer init - no manifest yet");
      return;
    }

    const container = viewerContainerRef.current;
    if (!container) {
      console.log("Container not ready, will retry...");
      return;
    }

    console.log("Creating PDFViewer with container:", container);

    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });
    const pdfViewer = new PDFViewer({
      container,
      eventBus,
      linkService,
      textLayerMode: 1,
      removePageBorders: true,
      maxCanvasPixels: 33554432,
    });

    const handlePageChange = (evt: PageChangingEvent) => {
      setPageNum(evt.pageNumber);
    };

    const handleScaleChange = (evt: ScaleChangingEvent) => {
      const newScale = evt.scale;
      setScale(newScale);

      const presetValue = evt.presetValue;
      if (presetValue && knownZoomValues.has(presetValue)) {
        setScalePreset(presetValue);
      } else {
        const normalizedValue = newScale.toFixed(2);
        if (percentageValues.has(normalizedValue)) {
          const matched = ZOOM_PERCENTAGE_OPTIONS.find(
            (option) =>
              Number.parseFloat(option.value).toFixed(2) === normalizedValue
          );
          setScalePreset(matched?.value ?? "custom");
        } else {
          setScalePreset("custom");
        }
      }
    };

    const handlePagesLoaded = () => {
      console.log("Pages loaded event fired!");
      setLoading(false);
    };

    const handlePagesInit = () => {
      const viewer = viewerRef.current;
      if (!viewer) return;

      // Prefer not to pre-render the next page in single-request mode to avoid
      // fetching multiple pages on initial load.
      // try {
      //   const rq =
      //     (viewer as unknown as { _pdfRenderingQueue?: any })
      //       ._pdfRenderingQueue ??
      //     (viewer as unknown as { renderingQueue?: any }).renderingQueue;
      //   if (rq && typeof rq === "object") {
      //     rq.preRenderExtraPage = false;
      //   }
      // } catch {
      //   // ignore if internals change
      // }

      // Apply initial scale on next frame to ensure layout is ready
      requestAnimationFrame(() => {
        console.log("Applying initial scale after pagesinit:", scalePreset);
        if (scalePreset === "custom") {
          viewer.currentScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
        } else {
          viewer.currentScaleValue = scalePreset;
        }
      });
    };

    const handleDocumentError = (evt: { message: string }) => {
      setError(evt?.message || "Failed to load PDF document");
      setLoading(false);
    };

    eventBus.on("pagechanging", handlePageChange);
    eventBus.on("scalechanging", handleScaleChange);
    eventBus.on("pagesloaded", handlePagesLoaded);
    eventBus.on("pagesinit", handlePagesInit);
    eventBus.on("documenterror", handleDocumentError);

    linkService.setViewer(pdfViewer);
    viewerRef.current = pdfViewer;
    eventBusRef.current = eventBus;

    const lazyDoc = new LazyPDFDocument(
      manifest,
      useRangeRequests ? CHUNKED_LOAD_OPTIONS : SINGLE_REQUEST_LOAD_OPTIONS
    );
    lazyDocRef.current = lazyDoc;

    let cancelled = false;

    const initializeViewer = async () => {
      try {
        console.log("Loading first page...");
        const firstPage = await lazyDoc.getPage(1);
        console.log("First page loaded:", firstPage);
        if (cancelled) return;

        console.log("Setting document on viewer...");
        // Set document on linkService first, then viewer
        linkService.setDocument(lazyDoc as unknown as PDFDocumentProxy, null);
        pdfViewer.setDocument(lazyDoc as unknown as PDFDocumentProxy);

        console.log("Viewer initialized, pages count:", pdfViewer.pagesCount);
      } catch (err) {
        console.error("Failed to initialize lazy PDF viewer", err);
        if (!cancelled) {
          setError((err as Error)?.message || "Failed to load PDF");
          setLoading(false);
        }
      }
    };

    void initializeViewer();

    return () => {
      cancelled = true;
      eventBus.off("pagechanging", handlePageChange);
      eventBus.off("scalechanging", handleScaleChange);
      eventBus.off("pagesloaded", handlePagesLoaded);
      eventBus.off("pagesinit", handlePagesInit);
      eventBus.off("documenterror", handleDocumentError);

      pdfViewer.cleanup();
      linkService.setDocument(null, null);
      viewerRef.current = null;
      eventBusRef.current = null;

      lazyDocRef.current?.destroy();
      lazyDocRef.current = null;
    };
  }, [manifest, useRangeRequests]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      const viewer = viewerRef.current;
      const eventBus = eventBusRef.current;
      const lazyDoc = lazyDocRef.current;

      if (eventBus) {
        eventBus.off("pagechanging", () => {});
        eventBus.off("scalechanging", () => {});
        eventBus.off("pagesloaded", () => {});
        eventBus.off("documenterror", () => {});
      }

      if (viewer) {
        viewer.cleanup();
        viewerRef.current = null;
      }

      eventBusRef.current = null;

      if (lazyDoc) {
        lazyDoc.destroy();
        lazyDocRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (viewerRef.current && manifest) {
      viewerRef.current.update();
    }
  }, [manifest]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (scalePreset === "custom") {
      if (Math.abs(viewer.currentScale - scale) > 0.001) {
        viewer.currentScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
      }
    } else if (viewer.currentScaleValue !== scalePreset) {
      viewer.currentScaleValue = scalePreset;
    }
  }, [scale, scalePreset]);

  const goToPrevPage = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (pageNum <= 1) return;
    viewer.currentPageNumber = pageNum - 1;
  };

  const goToNextPage = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (pageNum >= pageCount) return;
    viewer.currentPageNumber = pageNum + 1;
  };

  const zoomIn = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const nextScale = calculateNextZoomScale(viewer.currentScale, 1);
    viewer.currentScale = nextScale;
    setScalePreset("custom");
    setScale(nextScale);
  };

  const zoomOut = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const nextScale = calculateNextZoomScale(viewer.currentScale, -1);
    viewer.currentScale = nextScale;
    setScalePreset("custom");
    setScale(nextScale);
  };

  const handleZoomPresetChange = (value: string) => {
    if (value === "custom") {
      return;
    }

    if (ZOOM_PERCENTAGE_OPTIONS.some((option) => option.value === value)) {
      const numericValue = Number.parseFloat(value);
      if (!Number.isNaN(numericValue)) {
        setScalePreset("custom");
        setScale(numericValue);
      }
      return;
    }

    setScalePreset(value);
  };

  const selectValue = useMemo(() => {
    if (scalePreset === "custom") {
      return "custom";
    }
    if (
      ZOOM_PRESET_OPTIONS.some((option) => option.value === scalePreset) ||
      ZOOM_PERCENTAGE_OPTIONS.some((option) => option.value === scalePreset)
    ) {
      return scalePreset;
    }
    return "custom";
  }, [scalePreset]);

  const customZoomLabel = `Custom (${Math.round(scale * 100)}%)`;

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        {loading && (
          <div className="flex items-center justify-center w-full gap-4">
            <Progress value={undefined} className="w-64" />
            <span className="text-sm">Loading manifest...</span>
          </div>
        )}
        {error && <p className="error text-red-600">Error: {error}</p>}
        {!loading && !error && manifest && (
          <>
            {/* Left section: Navigation controls */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={goToPrevPage}
                disabled={pageNum <= 1}
                aria-label="Go to previous page"
              >
                <ChevronLeft className="icon-16" />
                <span className="label-desktop">Previous</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={goToNextPage}
                disabled={pageNum >= pageCount}
                aria-label="Go to next page"
              >
                <span className="label-desktop">Next</span>
                <ChevronRight className="icon-16" />
              </Button>
              <span>{`Page ${pageNum} of ${pageCount}`}</span>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={zoomOut}
                aria-label="Zoom out"
              >
                <Minus className="icon-16" />
              </Button>
              <Select
                value={selectValue}
                onValueChange={handleZoomPresetChange}
              >
                <SelectTrigger size="sm" className="zoom-select-trigger">
                  <SelectValue placeholder="Zoom" />
                </SelectTrigger>
                <SelectContent className="zoom-select-content">
                  <SelectGroup>
                    <SelectLabel>Presets</SelectLabel>
                    {ZOOM_PRESET_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Zoom levels</SelectLabel>
                    {ZOOM_PERCENTAGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Current</SelectLabel>
                    <SelectItem value="custom">{customZoomLabel}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={zoomIn}
                aria-label="Zoom in"
              >
                <Plus className="icon-16" />
              </Button>
            </div>
          </>
        )}
      </div>

      <div ref={viewerContainerRef} className="pdf-viewer-container-wrapper">
        <div className="pdfViewer" />
      </div>
    </div>
  );
}
