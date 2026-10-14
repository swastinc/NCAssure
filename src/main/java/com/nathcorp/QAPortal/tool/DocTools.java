package com.nathcorp.QAPortal.tool;

import com.nathcorp.QAPortal.service.DocLinkService;
import com.nathcorp.QAPortal.service.SharePointIngestionService;
import org.springframework.ai.document.Document;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;

@Component
public class DocTools {

    private final VectorStore vectorStore;
    private final DocLinkService docLinkService;
    private final SharePointIngestionService ingestionService;

    public DocTools(VectorStore vectorStore,
                    DocLinkService docLinkService,
                    SharePointIngestionService ingestionService) {
        this.vectorStore = vectorStore;
        this.docLinkService = docLinkService;
        this.ingestionService = ingestionService;
    }

    // ===== Existing tool (search only) =====
    @Tool(
            name = "search_docs",
            description = """
            Search the indexed company PDFs/docs (Azure AI Search) and return the most relevant passages.
            Use this ONLY for documentation/how-to/policy/setup/architecture questions.
            Return passages with metadata. If nothing found, return an empty matches list.
        """
    )
    public Map<String, Object> searchDocs(
            @ToolParam(description = "User question / search query") String query,
            @ToolParam(required = false, description = "Optional document id filter") String docId,
            @ToolParam(required = false, description = "Optional project filter") String project,
            @ToolParam(required = false, description = "Optional version filter") String version,
            @ToolParam(required = false, description = "Top K results, default 6") Integer topK
    ) {
        return doSearch(query, docId, project, version, topK);
    }

    // ===== NEW tool: links -> ingest -> search (ONE tool call) =====
    @Tool(
            name = "rag_sharepoint_docs",
            description = """
            End-to-end RAG from SharePoint links:
            1) Get SharePoint file links for (project, version)
            2) Download + extract + chunk + index into Azure AI Search (if not already indexed)
            3) Retrieve top passages for the user query.

            Use this for doc questions when files come from SharePoint links.
            Returns JSON with ingestion summary + matches (text + metadata).
            """
    )
    public Map<String, Object> ragSharePointDocs(
            @ToolParam(description = "User question") String query,
            @ToolParam(description = "Project name (required)") String project,
            @ToolParam(description = "Version/tag name (required)") String version,
            @ToolParam(required = false, description = "Top K results (default 6, max 12)") Integer topK,
            @ToolParam(required = false, description = "Force reindex even if cached (default false)") Boolean forceReindex
    ) {
        int k = (topK == null || topK <= 0) ? 6 : Math.min(topK, 12);
        boolean force = forceReindex != null && forceReindex;

        // 1) Fetch links
        List<String> links = docLinkService.getSharePointLinks(project, version);

        // 2) Ingest/index
        SharePointIngestionService.IngestSummary ingest =
                ingestionService.ensureIndexed(links, project, version, force);

        // 3) Search (pull extra, then filter down)
        // We search larger because we post-filter by metadata safely.
        int rawK = Math.min(30, k * 5);
        List<Document> results = vectorStore.similaritySearch(
                SearchRequest.builder()
                        .query(query)
                        .topK(rawK)
                        .build()
        );

        List<Document> filtered = results.stream()
                .filter(d -> metaEq(d, "project", project))
                .filter(d -> metaEq(d, "version", version))
                .limit(k)
                .toList();

        List<Map<String, Object>> matches = filtered.stream().map(d -> {
            Map<String, Object> m = new LinkedHashMap<>();
            String text = safeText(d);
            m.put("text", text);
            m.put("metadata", d.getMetadata());
            return m;
        }).collect(Collectors.toList());

        return Map.of(
                "query", query,
                "project", project,
                "version", version,
                "topK", k,
                "linkCount", links.size(),
                "ingestion", Map.of(
                        "success", ingest.success(),
                        "skipped", ingest.skipped(),
                        "failed", ingest.failed(),
                        "errors", ingest.errors()
                ),
                "matchCount", matches.size(),
                "matches", matches
        );
    }

    // ---------- helpers ----------
    private Map<String, Object> doSearch(String query, String docId, String project, String version, Integer topK) {
        int k = (topK == null || topK <= 0) ? 6 : Math.min(topK, 12);

        List<Document> results = vectorStore.similaritySearch(
                SearchRequest.builder()
                        .query(query)
                        .topK(k)
                        .build()
        );

        List<Document> filtered = results.stream()
                .filter(d -> metaEq(d, "doc_id", docId))
                .filter(d -> metaEq(d, "project", project))
                .filter(d -> metaEq(d, "version", version))
                .toList();

        List<Map<String, Object>> matches = filtered.stream().map(d -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("text", safeText(d));
            m.put("metadata", d.getMetadata());
            return m;
        }).toList();

        return Map.of(
                "query", query,
                "topK", k,
                "filters", Map.of(
                        "doc_id", safe(docId),
                        "project", safe(project),
                        "version", safe(version)
                ),
                "matchCount", matches.size(),
                "matches", matches
        );
    }

    private boolean metaEq(Document d, String key, String expected) {
        if (expected == null || expected.isBlank()) return true;
        Object v = d.getMetadata() == null ? null : d.getMetadata().get(key);
        return expected.equals(String.valueOf(v));
    }

    private String safe(String s) { return s == null ? "" : s; }

    private String safeText(Document d) {
        try {
            // your current style
            if (d.isText()) return d.getText() == null ? "" : d.getText();
        } catch (Exception ignored) {}
        try {
            // fallback for other Spring AI versions
            return d.getText() == null ? "" : d.getText();
        } catch (Exception ignored) {}
        return "";
    }
}
