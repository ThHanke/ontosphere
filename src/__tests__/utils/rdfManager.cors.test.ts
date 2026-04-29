// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { RDFManagerImpl } from "../../utils/rdfManager.impl";

const mockWorker = {
  call: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
} as any;

function makeInstance() {
  return new RDFManagerImpl({ workerClient: mockWorker });
}

const TARGET = "https://example.org/test.ttl";
const PROXY = "https://corsproxy.io/?url=";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchWithCorsFallback", () => {
  it("Scenario A: proxy activates on direct fetch failure", async () => {
    const proxyResponse = new Response("ok", { status: 200 });
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(proxyResponse);
    vi.stubGlobal("fetch", mockFetch);

    const inst = makeInstance();
    const controller = new AbortController();
    const result = await (inst as any).fetchWithCorsFallback(
      TARGET,
      { Accept: "text/turtle" },
      controller.signal,
      undefined,
      PROXY,
    );

    expect(result).toBe(proxyResponse);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const secondCall = mockFetch.mock.calls[1];
    expect(secondCall[0]).toBe(PROXY + encodeURIComponent(TARGET));
  });

  it("Scenario B: no proxy configured — error propagates", async () => {
    const fetchError = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(fetchError));

    const inst = makeInstance();
    const controller = new AbortController();
    await expect(
      (inst as any).fetchWithCorsFallback(
        TARGET,
        {},
        controller.signal,
        undefined,
        "",
      ),
    ).rejects.toThrow("Failed to fetch");

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("Scenario C: direct fetch succeeds — proxy never called", async () => {
    const directResponse = new Response("ok", { status: 200 });
    const mockFetch = vi.fn().mockResolvedValue(directResponse);
    vi.stubGlobal("fetch", mockFetch);

    const inst = makeInstance();
    const controller = new AbortController();
    const result = await (inst as any).fetchWithCorsFallback(
      TARGET,
      {},
      controller.signal,
      undefined,
      PROXY,
    );

    expect(result).toBe(directResponse);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe(TARGET);
  });
});
