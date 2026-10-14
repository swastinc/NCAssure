package com.nathcorp.QAPortal.service;

import com.nathcorp.QAPortal.dto.BugFeatureLabelingResult;
import com.nathcorp.QAPortal.dto.BugItem;
import com.nathcorp.QAPortal.dto.Tag;
import com.nathcorp.QAPortal.dto.BugFeatureSummaryResponse;
import com.nathcorp.QAPortal.dto.BugFeatureSummaryResponse.FeatureCount;
import com.nathcorp.QAPortal.dto.BugFeatureSummaryResponse.TopBug;
import org.springframework.ai.azure.openai.AzureOpenAiChatOptions;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.converter.BeanOutputConverter;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class BugFeatureAiService {

    private static final int AI_BATCH_SIZE = 30;
    private static final int MAX_TAG_HINTS = 25;
    private static final int MAX_OUTPUT_FEATURES = 25;

    private static final String DEFAULT_FEATURE_KEY = "general";
    private static final String DEFAULT_FEATURE_DISPLAY = "General";

    private static final Pattern VERSION_TAG_PATTERN =
            Pattern.compile("^(v)?\\d+(\\.\\d+)*$", Pattern.CASE_INSENSITIVE);

    /*
     * This is intentionally a real system instruction instead of writing
     * "Developer:" inside a normal user prompt.
     *
     * It applies to:
     * 1. bug feature classification
     * 2. semantic feature grouping
     * 3. AI insights generation
     */
    private static final String ENGLISH_ONLY_SYSTEM_PROMPT = """
            You are an AI Quality Engineering assistant.

            LANGUAGE REQUIREMENT:
            - Always respond only in clear American English.
            - Use English words written with Latin characters.
            - Never generate Hindi, Urdu, Devanagari, Arabic-script,
              or other non-English-language text.
            - Even if input data contains another language, your output
              must remain in English.
            - Do not translate English content into another language.
            - When JSON is requested, preserve the required JSON schema exactly.
            """;

    private final ChatClient bugClassifierClient;

    public BugFeatureAiService(
            @Qualifier("bugClassifierClient")
            ChatClient bugClassifierClient
    ) {
        this.bugClassifierClient = bugClassifierClient;
    }

    public BugFeatureSummaryResponse summarizeByFeature(List<BugItem> bugs) {

        if (bugs == null) {
            bugs = List.of();
        }

        if (bugs.isEmpty()) {
            return new BugFeatureSummaryResponse(
                    0,
                    List.of(),
                    "No bugs found to summarize.",
                    Map.of()
            );
        }

        List<String> tagHints =
                deriveCandidateFeaturesFromTags(
                        bugs,
                        MAX_TAG_HINTS
                );

        /*
         * Stage 1:
         * Ask AI to understand each bug and assign a feature/module.
         */
        Map<Integer, String> rawLabels =
                classifyInBatches(
                        bugs,
                        tagHints
                );

        /*
         * Stage 2:
         * Ask AI to semantically group similar labels.
         *
         * Example only:
         *
         * Sign In
         * Authentication
         * Login Flow
         *
         * may all become one canonical feature chosen by AI.
         *
         * There is no hard-coded Java keyword mapping.
         */
        Map<Integer, String> labels =
                groupSimilarFeaturesWithAi(rawLabels);

        /*
         * Count final canonical features in Java.
         */
        Map<String, Integer> featureCounts =
                new HashMap<>();

        Map<Integer, String> bugToFeatureKey =
                new HashMap<>();

        for (BugItem b : bugs) {

            if (b == null) {
                continue;
            }

            String rawFeature =
                    labels.getOrDefault(
                            b.getWorkItemId(),
                            fallbackFeatureForBug(b)
                    );

            String featureKey =
                    normalizeFeature(rawFeature);

            if (featureKey.isBlank()) {
                featureKey = DEFAULT_FEATURE_KEY;
            }

            bugToFeatureKey.put(
                    b.getWorkItemId(),
                    featureKey
            );

            featureCounts.merge(
                    featureKey,
                    1,
                    Integer::sum
            );
        }

        Map<String, Integer> trimmedCounts =
                trimToTopN(
                        featureCounts,
                        MAX_OUTPUT_FEATURES,
                        DEFAULT_FEATURE_KEY
                );

        List<FeatureCount> featureCountList =
                trimmedCounts.entrySet()
                        .stream()
                        .sorted(
                                (a, b) ->
                                        Integer.compare(
                                                b.getValue(),
                                                a.getValue()
                                        )
                        )
                        .map(
                                e -> new FeatureCount(
                                        toDisplayFeature(e.getKey()),
                                        e.getValue()
                                )
                        )
                        .toList();

        String aiSummary =
                generateAiSummary(
                        bugs.size(),
                        featureCountList
                );

        Map<String, List<TopBug>> topBugsByFeature =
                buildTopBugsByFeature(
                        bugs,
                        bugToFeatureKey,
                        trimmedCounts.keySet(),
                        featureCountList
                );

        return new BugFeatureSummaryResponse(
                bugs.size(),
                featureCountList,
                aiSummary,
                topBugsByFeature
        );
    }

    private Map<String, List<TopBug>> buildTopBugsByFeature(
            List<BugItem> bugs,
            Map<Integer, String> bugToFeatureKey,
            Set<String> keepFeatureKeys,
            List<FeatureCount> orderedFeatureCounts
    ) {

        Map<String, List<TopBug>> grouped =
                new HashMap<>();

        for (BugItem b : bugs) {

            if (b == null) {
                continue;
            }

            int id = b.getWorkItemId();
            String title = safe(b.getTitle());

            String featureKey =
                    bugToFeatureKey.getOrDefault(
                            id,
                            DEFAULT_FEATURE_KEY
                    );

            if (keepFeatureKeys != null
                    && !keepFeatureKeys.contains(featureKey)) {

                featureKey = DEFAULT_FEATURE_KEY;
            }

            String display =
                    toDisplayFeature(featureKey);

            grouped.computeIfAbsent(
                            display,
                            k -> new ArrayList<>()
                    )
                    .add(
                            new TopBug(
                                    id,
                                    title,
                                    b.getAssignedTo() != null
                                            ? b.getAssignedTo().getUserName()
                                            : "Unassigned"
                            )
                    );
        }

        for (Map.Entry<String, List<TopBug>> e
                : grouped.entrySet()) {

            List<TopBug> list = e.getValue();

            list.sort(
                    (a, b) ->
                            Integer.compare(
                                    b.getWorkItemId(),
                                    a.getWorkItemId()
                            )
            );

            if (list.size() > 5) {
                e.setValue(
                        new ArrayList<>(
                                list.subList(0, 5)
                        )
                );
            }
        }

        Map<String, List<TopBug>> ordered =
                new LinkedHashMap<>();

        for (FeatureCount fc : orderedFeatureCounts) {

            String feature = fc.getFeature();

            ordered.put(
                    feature,
                    grouped.getOrDefault(
                            feature,
                            List.of()
                    )
            );
        }

        return ordered;
    }

    // =========================================================
    // STAGE 1 - AI BUG FEATURE LABELING
    // =========================================================

    private Map<Integer, String> classifyInBatches(
            List<BugItem> bugs,
            List<String> tagHints
    ) {

        Map<Integer, String> out =
                new HashMap<>();

        for (int i = 0;
             i < bugs.size();
             i += AI_BATCH_SIZE) {

            List<BugItem> batch =
                    bugs.subList(
                            i,
                            Math.min(
                                    i + AI_BATCH_SIZE,
                                    bugs.size()
                            )
                    );

            out.putAll(
                    classifyBatch(
                            batch,
                            tagHints
                    )
            );
        }

        return out;
    }

    private Map<Integer, String> classifyBatch(
            List<BugItem> batch,
            List<String> tagHints
    ) {

        List<Map<String, Object>> compact =
                batch.stream()
                        .filter(Objects::nonNull)
                        .map(
                                b -> Map.<String, Object>of(
                                        "workItemId",
                                        b.getWorkItemId(),

                                        "title",
                                        safe(b.getTitle()),

                                        "assignedTo",
                                        b.getAssignedTo() != null
                                                ? safe(
                                                b.getAssignedTo()
                                                        .getUserName()
                                        )
                                                : "Unassigned",

                                        "tags",
                                        tagsToList(
                                                b.getTags()
                                        )
                                )
                        )
                        .toList();

        BeanOutputConverter<BugFeatureLabelingResult> converter =
                new BeanOutputConverter<>(
                        BugFeatureLabelingResult.class
                );

        String format =
                converter.getFormat();

        String userPrompt = """
                Analyze each Azure DevOps bug and determine the PRODUCT FEATURE
                or PRODUCT MODULE that the bug belongs to.

                Your goal is semantic understanding, not keyword matching.

                Important grouping behavior:
                - Bugs describing the same product capability should receive
                  the same feature name.
                - Understand synonyms and different wording semantically.
                - Do not create separate categories just because bug titles
                  use different terminology.
                - Do not over-group genuinely different product capabilities.
                - Infer the feature from the meaning of the bug title.
                - Tags are secondary context only.
                - Tag hints are optional candidate feature names.
                - You may reuse an appropriate tag hint when it accurately
                  represents the bug.
                - You may create a better feature name when none of the hints
                  accurately represents the bug.

                Feature naming rules:
                - Feature must be English only.
                - Feature must normally be 1 to 3 words.
                - Feature must describe a product capability, feature, or module.
                - Use concise and reusable names.
                - Do not return release/version names.
                - Do not return Sprint, Build, Hotfix, or Release names.
                - Do not classify bugs simply as Button, Icon, Label,
                  Textbox, Dropdown, Page, Screen, UI, or UX.
                - Do not use the assignee name as the feature.
                - Prefer one stable category name for semantically similar bugs.
                - If the product feature cannot reasonably be determined,
                  return "%s".

                Tag hints:
                %s

                Bugs:
                %s

                Return JSON strictly according to this schema:

                %s
                """.formatted(
                DEFAULT_FEATURE_DISPLAY,
                tagHints,
                compact,
                format
        );

        Map<Integer, String> map =
                new HashMap<>();

        try {

            String raw =
                    callAiEnglish(
                            userPrompt,
                            900
                    );

            if (raw == null
                    || raw.trim().isEmpty()) {

                return fallbackBatchLabels(batch);
            }

            BugFeatureLabelingResult result;

            try {

                result = converter.convert(raw);

            } catch (Exception ex) {

                return fallbackBatchLabels(batch);
            }

            if (result != null
                    && result.getItems() != null) {

                for (BugFeatureLabelingResult.Item item
                        : result.getItems()) {

                    if (item == null) {
                        continue;
                    }

                    String normalized =
                            normalizeFeature(
                                    item.getFeature()
                            );

                    if (normalized.isBlank()
                            || DEFAULT_FEATURE_KEY.equals(normalized)) {

                        normalized =
                                fallbackFeatureForBug(
                                        findBugById(
                                                batch,
                                                item.getWorkItemId()
                                        )
                                );
                    }

                    map.put(
                            item.getWorkItemId(),
                            normalized
                    );
                }
            }

            /*
             * Ensure every bug receives a label even if
             * the AI omitted an item.
             */
            for (BugItem bug : batch) {

                if (bug == null) {
                    continue;
                }

                map.putIfAbsent(
                        bug.getWorkItemId(),
                        fallbackFeatureForBug(bug)
                );
            }

            return map;

        } catch (Exception ex) {

            return fallbackBatchLabels(batch);
        }
    }

    private BugItem findBugById(
            List<BugItem> batch,
            int workItemId
    ) {

        if (batch == null) {
            return null;
        }

        for (BugItem bug : batch) {

            if (bug != null
                    && bug.getWorkItemId() == workItemId) {

                return bug;
            }
        }

        return null;
    }

    private Map<Integer, String> fallbackBatchLabels(
            List<BugItem> batch
    ) {

        Map<Integer, String> fallback =
                new HashMap<>();

        if (batch == null) {
            return fallback;
        }

        for (BugItem bug : batch) {

            if (bug == null) {
                continue;
            }

            fallback.put(
                    bug.getWorkItemId(),
                    fallbackFeatureForBug(bug)
            );
        }

        return fallback;
    }

    /*
     * No hard-coded feature dictionary here.
     *
     * This method is only used when the AI call itself fails.
     *
     * A useful non-release tag is used when available;
     * otherwise the feature falls back to General.
     */
    private String fallbackFeatureForBug(
            BugItem bug
    ) {

        if (bug == null) {
            return DEFAULT_FEATURE_KEY;
        }

        if (bug.getTags() != null) {

            for (Tag tag : bug.getTags()) {

                if (tag == null
                        || tag.getTagName() == null) {

                    continue;
                }

                String value =
                        tag.getTagName().trim();

                if (value.isEmpty()) {
                    continue;
                }

                if (looksLikeNoiseTag(value)) {
                    continue;
                }

                String normalized =
                        normalizeFeature(value);

                if (!normalized.isBlank()
                        && !DEFAULT_FEATURE_KEY.equals(normalized)) {

                    return normalized;
                }
            }
        }

        return DEFAULT_FEATURE_KEY;
    }

    // =========================================================
    // STAGE 2 - AI SEMANTIC FEATURE GROUPING
    // =========================================================

    private Map<Integer, String> groupSimilarFeaturesWithAi(
            Map<Integer, String> rawLabels
    ) {

        if (rawLabels == null
                || rawLabels.isEmpty()) {

            return Map.of();
        }

        /*
         * Normalize only formatting.
         * No business/category keyword mapping happens here.
         */
        Map<Integer, String> normalizedByBug =
                new LinkedHashMap<>();

        for (Map.Entry<Integer, String> entry
                : rawLabels.entrySet()) {

            String normalized =
                    normalizeFeature(
                            entry.getValue()
                    );

            normalizedByBug.put(
                    entry.getKey(),
                    normalized
            );
        }

        List<String> uniqueFeatures =
                normalizedByBug.values()
                        .stream()
                        .filter(Objects::nonNull)
                        .filter(s -> !s.isBlank())
                        .filter(
                                s -> !DEFAULT_FEATURE_KEY.equalsIgnoreCase(s)
                        )
                        .distinct()
                        .toList();

        /*
         * Nothing needs semantic grouping when only
         * zero or one real feature exists.
         */
        if (uniqueFeatures.size() <= 1) {
            return normalizedByBug;
        }

        Map<String, String> canonicalBySource =
                new HashMap<>();

        List<String> canonicalFeatures =
                new ArrayList<>();

        for (int i = 0;
             i < uniqueFeatures.size();
             i += AI_BATCH_SIZE) {

            List<String> batch =
                    uniqueFeatures.subList(
                            i,
                            Math.min(
                                    i + AI_BATCH_SIZE,
                                    uniqueFeatures.size()
                            )
                    );

            Map<String, String> batchMappings =
                    groupFeatureLabelBatch(
                            batch,
                            canonicalFeatures
                    );

            for (String source : batch) {

                String canonical =
                        batchMappings.getOrDefault(
                                source,
                                source
                        );

                canonical =
                        normalizeFeature(canonical);

                if (canonical.isBlank()
                        || DEFAULT_FEATURE_KEY.equals(canonical)) {

                    canonical = source;
                }

                /*
                 * If the exact canonical feature already exists,
                 * reuse the existing canonical string.
                 */
                String existing =
                        findExistingCanonical(
                                canonicalFeatures,
                                canonical
                        );

                if (existing != null) {

                    canonical = existing;

                } else {

                    canonicalFeatures.add(canonical);
                }

                canonicalBySource.put(
                        source,
                        canonical
                );
            }
        }

        Map<Integer, String> grouped =
                new LinkedHashMap<>();

        for (Map.Entry<Integer, String> entry
                : normalizedByBug.entrySet()) {

            String source =
                    entry.getValue();

            if (source == null
                    || source.isBlank()
                    || DEFAULT_FEATURE_KEY.equals(source)) {

                grouped.put(
                        entry.getKey(),
                        DEFAULT_FEATURE_KEY
                );

                continue;
            }

            grouped.put(
                    entry.getKey(),
                    canonicalBySource.getOrDefault(
                            source,
                            source
                    )
            );
        }

        return grouped;
    }

    private Map<String, String> groupFeatureLabelBatch(
            List<String> sourceFeatures,
            List<String> existingCanonicalFeatures
    ) {

        if (sourceFeatures == null
                || sourceFeatures.isEmpty()) {

            return Map.of();
        }

        /*
         * Reuse the existing BugFeatureLabelingResult DTO.
         *
         * Here workItemId is simply a temporary correlation ID
         * for each source feature.
         */
        Map<Integer, String> idToSource =
                new LinkedHashMap<>();

        List<Map<String, Object>> featureInput =
                new ArrayList<>();

        int id = 1;

        for (String feature : sourceFeatures) {

            idToSource.put(
                    id,
                    feature
            );

            featureInput.add(
                    Map.of(
                            "workItemId",
                            id,
                            "feature",
                            feature
                    )
            );

            id++;
        }

        BeanOutputConverter<BugFeatureLabelingResult> converter =
                new BeanOutputConverter<>(
                        BugFeatureLabelingResult.class
                );

        String format =
                converter.getFormat();

        List<String> existing =
                existingCanonicalFeatures == null
                        ? List.of()
                        : existingCanonicalFeatures;

        String prompt = """
                Perform semantic PRODUCT FEATURE grouping.

                You will receive short feature labels generated from bug titles.

                For every source feature, return the best CANONICAL feature name.

                Main goal:
                Merge feature labels that represent the same product capability,
                even when they use different wording or synonyms.

                Existing canonical features:
                %s

                Rules:
                - Use semantic meaning, not simple keyword matching.
                - If a source feature means the same thing as an existing
                  canonical feature, reuse that existing feature exactly.
                - Within the current input batch, semantically equivalent
                  source features must receive the same canonical feature.
                - Create a new canonical feature only when the source represents
                  a genuinely different product capability.
                - Do not merge unrelated features just because both relate
                  to UI or the same page.
                - Keep meaningful product modules separate.
                - Canonical feature must be English only.
                - Prefer 1 to 3 words.
                - Use a concise product/module name.
                - Do not return explanations.
                - Return one result for every input workItemId.
                - Preserve each workItemId exactly.

                Source features:
                %s

                Return JSON strictly according to this schema:

                %s
                """.formatted(
                existing,
                featureInput,
                format
        );

        Map<String, String> mapping =
                new HashMap<>();

        try {

            String raw =
                    callAiEnglish(
                            prompt,
                            900
                    );

            if (raw == null
                    || raw.isBlank()) {

                return identityFeatureMapping(
                        sourceFeatures
                );
            }

            BugFeatureLabelingResult result;

            try {

                result = converter.convert(raw);

            } catch (Exception ex) {

                return identityFeatureMapping(
                        sourceFeatures
                );
            }

            if (result != null
                    && result.getItems() != null) {

                for (BugFeatureLabelingResult.Item item
                        : result.getItems()) {

                    if (item == null) {
                        continue;
                    }

                    String source =
                            idToSource.get(
                                    item.getWorkItemId()
                            );

                    if (source == null) {
                        continue;
                    }

                    String canonical =
                            normalizeFeature(
                                    item.getFeature()
                            );

                    if (canonical.isBlank()
                            || DEFAULT_FEATURE_KEY.equals(canonical)) {

                        canonical = source;
                    }

                    mapping.put(
                            source,
                            canonical
                    );
                }
            }

            /*
             * Never lose a source label just because
             * AI forgot to return it.
             */
            for (String source : sourceFeatures) {

                mapping.putIfAbsent(
                        source,
                        source
                );
            }

            return mapping;

        } catch (Exception ex) {

            return identityFeatureMapping(
                    sourceFeatures
            );
        }
    }

    private Map<String, String> identityFeatureMapping(
            List<String> sourceFeatures
    ) {

        Map<String, String> result =
                new HashMap<>();

        if (sourceFeatures == null) {
            return result;
        }

        for (String feature : sourceFeatures) {

            result.put(
                    feature,
                    feature
            );
        }

        return result;
    }

    private String findExistingCanonical(
            List<String> existing,
            String candidate
    ) {

        if (existing == null
                || candidate == null) {

            return null;
        }

        for (String value : existing) {

            if (value != null
                    && value.equalsIgnoreCase(candidate)) {

                return value;
            }
        }

        return null;
    }

    // =========================================================
    // AI INSIGHTS
    // =========================================================

    private String generateAiSummary(
            int totalBugs,
            List<FeatureCount> featureCounts
    ) {

        if (featureCounts == null
                || featureCounts.isEmpty()) {

            return "Bugs were detected, but no feature breakdown is available.";
        }

        List<FeatureCount> top =
                featureCounts.stream()
                        .limit(6)
                        .toList();

        StringBuilder topLines =
                new StringBuilder();

        for (FeatureCount fc : top) {

            topLines.append("- ")
                    .append(fc.getFeature())
                    .append(": ")
                    .append(fc.getCount())
                    .append("\n");
        }

        String prompt = """
                Act as a Quality Engineering Analyst.

                Analyze the current Azure DevOps bug distribution and provide
                concise executive-level QA insights.

                LANGUAGE:
                - Write only in simple conversational American English.
                - Do not use Hindi, Urdu, or any other language.

                Analysis constraints:
                - Analyze only the data supplied below.
                - No historical comparison is available.
                - Do not claim improvement or degradation over time.
                - Do not invent missing information.
                - Focus only on the current release data.
                - Avoid generic statements.
                - Use measurable insights and percentages where appropriate.
                - Detect concentration and uneven bug distribution.
                - Identify meaningful outliers.
                - Highlight potential release risk only when supported by data.
                - Suggest QA actions supported by the current distribution.
                - If the distribution is strongly skewed, explicitly identify
                  the concentration risk.

                Use these sections:

                1. Executive Summary
                2. High Risk Features
                3. Distribution Pattern
                4. Outlier Analysis
                5. Release Risk Assessment
                6. Recommended Actions

                Data:

                Total bugs: %d

                Top features:
                %s
                """.formatted(
                totalBugs,
                topLines
        );

        try {

            String out =
                    callAiEnglish(
                            prompt,
                            1000
                    );

            return out == null
                    ? ""
                    : out.trim();

        } catch (Exception ex) {

            return "AI summary could not be generated for this request, "
                    + "but the bug feature breakdown is available.";
        }
    }

    // =========================================================
    // COMMON AI CALL WITH ENGLISH ENFORCEMENT
    // =========================================================

    private String callAiEnglish(
            String userPrompt,
            int maxCompletionTokens
    ) {

        String response =
                executeAiCall(
                        userPrompt,
                        maxCompletionTokens
                );

        /*
         * Extra safety check.
         *
         * Even with a system message, if the model unexpectedly
         * returns Hindi/Urdu/another non-Latin writing system,
         * automatically retry once.
         */
        if (response != null
                && containsNonLatinLetters(response)) {

            String correctionPrompt = """
                    The previous response violated the English-only requirement.

                    Perform the original task again.

                    Mandatory requirements:
                    - Output only American English.
                    - Use Latin-script English words only.
                    - Do not output Hindi.
                    - Do not output Urdu.
                    - Do not output Devanagari.
                    - Do not output Arabic-script text.
                    - Preserve any JSON schema or requested output structure
                      from the original task exactly.
                    - Return only the corrected answer.

                    Original task:

                    %s

                    Previous invalid response:

                    %s
                    """.formatted(
                    userPrompt,
                    response
            );

            response =
                    executeAiCall(
                            correctionPrompt,
                            maxCompletionTokens
                    );
        }

        return response;
    }

    private String executeAiCall(
            String userPrompt,
            int maxCompletionTokens
    ) {

        return bugClassifierClient.prompt()
                .system(ENGLISH_ONLY_SYSTEM_PROMPT)
                .options(
                        AzureOpenAiChatOptions.builder()
                                .temperature(1.0)
                                .maxCompletionTokens(
                                        maxCompletionTokens
                                )
                                .build()
                )
                .user(userPrompt)
                .call()
                .content();
    }

    /*
     * Detect letters written using a non-Latin Unicode script.
     *
     * Punctuation such as em dash or Unicode percentage symbols
     * will not trigger this check because they are not letters.
     */
    private boolean containsNonLatinLetters(
            String value
    ) {

        if (value == null
                || value.isBlank()) {

            return false;
        }

        return value.codePoints()
                .anyMatch(
                        codePoint -> {

                            if (!Character.isLetter(codePoint)) {
                                return false;
                            }

                            Character.UnicodeScript script =
                                    Character.UnicodeScript.of(
                                            codePoint
                                    );

                            return script
                                    != Character.UnicodeScript.LATIN;
                        }
                );
    }

    // =========================================================
    // FEATURE NORMALIZATION
    // =========================================================

    /*
     * This method now performs FORMAT normalization only.
     *
     * It does NOT determine that:
     *
     * authentication -> login
     * analytics      -> reports
     * billing        -> payment
     *
     * Semantic grouping is handled by AI instead.
     */
    private String normalizeFeature(
            String input
    ) {

        if (input == null) {
            return DEFAULT_FEATURE_KEY;
        }

        String raw =
                input.trim()
                        .toLowerCase(Locale.ROOT);

        if (raw.isBlank()) {
            return DEFAULT_FEATURE_KEY;
        }

        /*
         * Check version format before punctuation is removed.
         */
        if (VERSION_TAG_PATTERN.matcher(raw).matches()) {
            return DEFAULT_FEATURE_KEY;
        }

        /*
         * Keep feature keys predictable for maps and response grouping.
         *
         * This also prevents unexpected non-English feature keys.
         */
        String s =
                raw.replaceAll(
                        "[^a-z0-9\\s]",
                        " "
                );

        s = s.replaceAll(
                        "\\s+",
                        " "
                )
                .trim();

        if (s.isBlank()) {
            return DEFAULT_FEATURE_KEY;
        }

        /*
         * Remove only grammatical leading articles.
         * This is formatting cleanup, not feature classification.
         */
        s = s.replaceFirst(
                "^the\\s+",
                ""
        );

        s = s.replaceFirst(
                "^a\\s+",
                ""
        );

        s = s.replaceFirst(
                "^an\\s+",
                ""
        );

        if (s.isBlank()) {
            return DEFAULT_FEATURE_KEY;
        }

        /*
         * Defensive size limit only.
         */
        if (s.length() > 40) {
            s = s.substring(
                            0,
                            40
                    )
                    .trim();
        }

        return s;
    }

    private String toDisplayFeature(
            String normalized
    ) {

        if (normalized == null
                || normalized.isBlank()) {

            return DEFAULT_FEATURE_DISPLAY;
        }

        if (normalized.equalsIgnoreCase(
                DEFAULT_FEATURE_KEY
        )) {

            return DEFAULT_FEATURE_DISPLAY;
        }

        String[] parts =
                normalized.split("\\s+");

        StringBuilder sb =
                new StringBuilder();

        for (String part : parts) {

            if (part.isBlank()) {
                continue;
            }

            sb.append(
                    Character.toUpperCase(
                            part.charAt(0)
                    )
            );

            if (part.length() > 1) {

                sb.append(
                        part.substring(1)
                );
            }

            sb.append(" ");
        }

        return sb.toString()
                .trim();
    }

    private Map<String, Integer> trimToTopN(
            Map<String, Integer> counts,
            int maxTop,
            String mergeKey
    ) {

        if (counts == null
                || counts.isEmpty()) {

            return Map.of();
        }

        if (counts.size() <= maxTop) {
            return counts;
        }

        List<Map.Entry<String, Integer>> sorted =
                counts.entrySet()
                        .stream()
                        .sorted(
                                (a, b) ->
                                        Integer.compare(
                                                b.getValue(),
                                                a.getValue()
                                        )
                        )
                        .toList();

        Map<String, Integer> out =
                new LinkedHashMap<>();

        int merged = 0;

        int keep =
                Math.max(
                        1,
                        maxTop
                );

        for (int i = 0;
             i < sorted.size();
             i++) {

            Map.Entry<String, Integer> e =
                    sorted.get(i);

            if (out.size() < keep) {

                out.put(
                        e.getKey(),
                        e.getValue()
                );

            } else {

                merged += e.getValue();
            }
        }

        if (merged > 0) {

            out.merge(
                    mergeKey,
                    merged,
                    Integer::sum
            );
        }

        return out;
    }

    // =========================================================
    // TAG HINTS
    // =========================================================

    private List<String> deriveCandidateFeaturesFromTags(
            List<BugItem> bugs,
            int topN
    ) {

        Map<String, Integer> freq =
                new HashMap<>();

        for (BugItem b : bugs) {

            if (b == null
                    || b.getTags() == null) {

                continue;
            }

            for (Tag t : b.getTags()) {

                if (t == null
                        || t.getTagName() == null) {

                    continue;
                }

                String name =
                        t.getTagName()
                                .trim();

                if (name.isEmpty()) {
                    continue;
                }

                if (looksLikeNoiseTag(name)) {
                    continue;
                }

                String hint =
                        normalizeFeature(name);

                if (hint.isBlank()
                        || DEFAULT_FEATURE_KEY.equalsIgnoreCase(hint)) {

                    continue;
                }

                freq.merge(
                        hint,
                        1,
                        Integer::sum
                );
            }
        }

        return freq.entrySet()
                .stream()
                .sorted(
                        (a, b) ->
                                Integer.compare(
                                        b.getValue(),
                                        a.getValue()
                                )
                )
                .limit(topN)
                .map(Map.Entry::getKey)
                .collect(
                        Collectors.toList()
                );
    }

    /*
     * These are metadata/release tags, not feature mappings.
     *
     * We still exclude them because Sprint/Build/Release/etc.
     * are not product features.
     */
    private boolean looksLikeNoiseTag(
            String tag
    ) {

        String t =
                tag.toLowerCase(Locale.ROOT)
                        .trim();

        return t.contains("sprint")
                || t.contains("release")
                || t.contains("iteration")
                || t.startsWith("build")
                || t.startsWith("hotfix")
                || t.startsWith("version")
                || VERSION_TAG_PATTERN.matcher(t).matches();
    }

    private List<String> tagsToList(
            List<Tag> tags
    ) {

        if (tags == null) {
            return List.of();
        }

        return tags.stream()
                .filter(Objects::nonNull)
                .map(Tag::getTagName)
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    private String safe(
            String value
    ) {

        return value == null
                || value.isBlank()
                ? "Unknown"
                : value.trim();
    }
}