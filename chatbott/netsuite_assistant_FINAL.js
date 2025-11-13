/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * AGSuite AI Knowledge Base Assistant - FINAL PRODUCTION VERSION
 * Multi-Client Support with Dynamic URL Generation
 *
 * Version: 3.0 - Complete Multi-Client Support
 */

define(['N/ui/serverWidget', 'N/llm', 'N/log', 'N/runtime', 'N/cache', 'N/file', 'N/url'],
    (serverWidget, llm, log, runtime, cache, file, url) => {

    // ========================================
    // CONFIGURATION - UPDATE PER CLIENT
    // ========================================

    const KNOWLEDGE_BASE = {
        // TODO: Replace with your actual Internal ID after uploading articles_index.json
        INDEX_FILE_ID: '3139', // UPDATE THIS with your articles_index.json Internal ID
        enabled: true,
        cache_ttl: 3600 // Cache index for 1 hour
    };

    // ========================================
    // DYNAMIC URL MAPPINGS - UPDATE PER CLIENT
    // ========================================
    // For each client deployment, update ONLY the rectypes
    // Everything else stays the same!

    const URL_MAPPINGS = {
        // TDS Related
        TDS_MASTER: {
            recordType: 'customrecord_agtax_tdsmaster',
            createUrl: '/app/common/custom/custrecordentry.nl?rectype=1042', // UPDATE rectype per client
            listUrl: '/app/common/custom/custrecordentrylist.nl?rectype=1042', // UPDATE rectype per client
            label: 'TDS Master'
        },

        TDS_PAYMENT: {
            recordType: 'customrecord_agtax_tds_payment',
            createUrl: '/app/common/custom/custrecordentry.nl?rectype=1044',
            listUrl: '/app/common/custom/custrecordentrylist.nl?rectype=1044',
            label: 'TDS Payment'
        },

        TDS_CHALLAN: {
            recordType: 'customrecord_agtax_tds_challan',
            createUrl: '/app/common/custom/custrecordentry.nl?rectype=1045',
            listUrl: '/app/common/custom/custrecordentrylist.nl?rectype=1045',
            label: 'TDS Challan'
        },

        TDS_SECTION: {
            recordType: 'customrecord_agtax_tds_section',
            createUrl: '/app/common/custom/custrecordentry.nl?rectype=1043',
            listUrl: '/app/common/custom/custrecordentrylist.nl?rectype=1043',
            label: 'TDS Section'
        },

        // AG Tax Related
        AGTAX_MATRIX: {
            recordType: 'customrecord_agtax_code_matrix',
            createUrl: '/app/common/custom/custrecordentry.nl?rectype=1028',
            listUrl: '/app/common/custom/custrecordentrylist.nl?rectype=1028',
            label: 'AG Tax Matrix'
        },

        FINANCIAL_YEAR: {
            recordType: 'customrecord_agtax_fy_master',
            createUrl: '/app/common/custom/custrecordentry.nl?rectype=1030',
            listUrl: '/app/common/custom/custrecordentrylist.nl?rectype=1030',
            label: 'Financial Year Master'
        },

        HSN_SAC: {
            recordType: 'customrecord_agtax_hsn_sac',
            createUrl: '/app/common/custom/custrecordentry.nl?rectype=1031',
            listUrl: '/app/common/custom/custrecordentrylist.nl?rectype=1031',
            label: 'HSN/SAC Code'
        },

        // Standard NetSuite Records (work automatically across all clients)
        TAX_CODE: {
            recordType: 'salestaxitem',
            label: 'Tax Code'
        },

        TAX_GROUP: {
            recordType: 'taxgroup',
            label: 'Tax Group'
        },

        CUSTOMER: {
            recordType: 'customer',
            label: 'Customer'
        },

        VENDOR: {
            recordType: 'vendor',
            label: 'Vendor'
        },

        ITEM: {
            recordType: 'inventoryitem',
            label: 'Item'
        },

        ACCOUNT: {
            recordType: 'account',
            label: 'Account'
        },

        INVOICE: {
            recordType: 'invoice',
            label: 'Sales Invoice'
        },

        VENDOR_BILL: {
            recordType: 'vendorbill',
            label: 'Vendor Bill'
        },

        EXPENSE_CATEGORY: {
            recordType: 'expensecategory',
            label: 'Expense Category'
        },

        LOCATION: {
            recordType: 'location',
            label: 'Location'
        },

        SUBSIDIARY: {
            recordType: 'subsidiary',
            label: 'Subsidiary'
        }
    };

    // ========================================
    // LLM CONFIGURATION
    // ========================================

    const LLM_CONFIG = {
        model: 'oracle/cohere-command-r-16k',
        maxTokens: 300,
        temperature: 0.3,
        maxSearchResults: 7
    };

    // ========================================
    // KNOWLEDGE BASE FUNCTIONS
    // ========================================

    /**
     * Load articles index from File Cabinet
     * Uses cache to avoid repeated file loads
     */
    function loadArticlesIndex() {
        if (!KNOWLEDGE_BASE.enabled) return null;

        try {
            // Try to get from cache first
            const knowledgeCache = cache.getCache({
                name: 'AGTAX_KNOWLEDGE_BASE',
                scope: cache.Scope.PRIVATE
            });

            const cachedIndex = knowledgeCache.get({ key: 'articles_index' });
            if (cachedIndex) {
                log.debug('Knowledge Base', 'Loaded from cache');
                return JSON.parse(cachedIndex);
            }

            // Load from file if not in cache
            log.debug('Loading Index', 'File ID: ' + KNOWLEDGE_BASE.INDEX_FILE_ID);
            const indexFile = file.load({ id: KNOWLEDGE_BASE.INDEX_FILE_ID });
            const indexContent = indexFile.getContents();
            const articlesIndex = JSON.parse(indexContent);

            // Store in cache
            knowledgeCache.put({
                key: 'articles_index',
                value: indexContent,
                ttl: KNOWLEDGE_BASE.cache_ttl
            });

            log.audit('Articles Index Loaded', articlesIndex.length + ' articles');
            return articlesIndex;

        } catch (e) {
            log.error('Failed to Load Articles Index', e.toString());
            return null;
        }
    }

    /**
     * Load full article content from File Cabinet
     */
    function loadArticleContent(fileId) {
        try {
            log.debug('Loading Article', 'File ID: ' + fileId);
            const articleFile = file.load({ id: fileId });
            const content = articleFile.getContents();
            return content;
        } catch (e) {
            log.error('Failed to Load Article', 'File ID: ' + fileId + ', Error: ' + e.toString());
            return 'Error loading article content. Please contact support.';
        }
    }

    /**
     * Process article content and replace placeholders with dynamic URLs
     * Placeholders: [CREATE:RESOURCE], [LIST:RESOURCE], [EDIT:RESOURCE:ID], [VIEW:RESOURCE]
     */
    function processArticlePlaceholders(articleContent) {
        if (!articleContent) return '';

        let processedContent = articleContent;

        // Regular expression to find placeholders
        const placeholderRegex = /\[(CREATE|LIST|EDIT|VIEW):([A-Z_]+)(?::([^\]]+))?\]/g;

        processedContent = processedContent.replace(placeholderRegex,
            function(match, action, resource, param) {
                try {
                    const mapping = URL_MAPPINGS[resource];

                    if (!mapping) {
                        log.warning({
                            title: 'Placeholder Not Found',
                            details: 'Resource: ' + resource + ' in: ' + match
                        });
                        return '<span class="error-placeholder" title="Not configured: ' + resource + '">[' + resource + ']</span>';
                    }

                    let generatedUrl = '';
                    let linkText = '';
                    let linkClass = '';

                    switch(action) {
                        case 'CREATE':
                            if (mapping.createUrl) {
                                generatedUrl = mapping.createUrl;
                            } else {
                                // Use URL resolver for standard records
                                try {
                                    generatedUrl = url.resolveRecord({
                                        recordType: mapping.recordType,
                                        isEdit: false
                                    });
                                } catch (e) {
                                    log.error('URL Resolve Error', 'CREATE ' + resource + ': ' + e);
                                    generatedUrl = '#';
                                }
                            }
                            linkText = 'Create ' + mapping.label;
                            linkClass = 'create-button';
                            return '<a href="' + generatedUrl + '" target="_blank" class="' + linkClass + '">' + linkText + '</a>';

                        case 'LIST':
                        case 'VIEW':
                            if (mapping.listUrl) {
                                generatedUrl = mapping.listUrl;
                            } else {
                                // Try to build list URL for standard records
                                try {
                                    if (mapping.recordType === 'customer') {
                                        generatedUrl = '/app/common/entity/custjob.nl?e=T';
                                    } else if (mapping.recordType === 'vendor') {
                                        generatedUrl = '/app/common/entity/vendorlist.nl';
                                    } else if (mapping.recordType === 'invoice') {
                                        generatedUrl = '/app/accounting/transactions/transactionlist.nl?Transaction_TYPE=CustInvc';
                                    } else if (mapping.recordType === 'vendorbill') {
                                        generatedUrl = '/app/accounting/transactions/transactionlist.nl?Transaction_TYPE=VendBill';
                                    } else {
                                        generatedUrl = '/app/common/search/searchresults.nl?searchtype=' + mapping.recordType;
                                    }
                                } catch (e) {
                                    log.error('URL Resolve Error', 'LIST ' + resource + ': ' + e);
                                    generatedUrl = '#';
                                }
                            }
                            linkText = 'View All ' + mapping.label + ' Records';
                            linkClass = 'list-link';
                            return '<a href="' + generatedUrl + '" target="_blank" class="' + linkClass + '">' + linkText + '</a>';

                        case 'EDIT':
                            if (!param) {
                                return '<span class="error-placeholder">[EDIT requires ID]</span>';
                            }
                            try {
                                generatedUrl = url.resolveRecord({
                                    recordType: mapping.recordType,
                                    recordId: param,
                                    isEdit: true
                                });
                            } catch (e) {
                                log.error('URL Resolve Error', 'EDIT ' + resource + ': ' + e);
                                generatedUrl = '#';
                            }
                            linkText = 'Edit ' + mapping.label;
                            linkClass = 'edit-link';
                            return '<a href="' + generatedUrl + '" target="_blank" class="' + linkClass + '">' + linkText + '</a>';

                        default:
                            return match;
                    }

                } catch (e) {
                    log.error('Placeholder Processing Error', e.toString());
                    return '<span class="error-placeholder">[Error: ' + match + ']</span>';
                }
            }
        );

        return processedContent;
    }

    /**
     * Detect if query is a question or search term
     */
    function detectIntent(query) {
        const questionWords = ['what', 'how', 'when', 'where', 'why', 'who', 'which', 'can', 'should', 'is', 'are', 'do', 'does'];
        const lowerQuery = query.toLowerCase().trim();

        if (lowerQuery.includes('?')) {
            return { isQuestion: true, intent: 'question' };
        }

        const firstWord = lowerQuery.split(' ')[0];
        if (questionWords.includes(firstWord)) {
            return { isQuestion: true, intent: 'question' };
        }

        if (lowerQuery.split(' ').length > 5) {
            return { isQuestion: true, intent: 'question' };
        }

        return { isQuestion: false, intent: 'search' };
    }

    /**
     * Rank articles using LLM
     */
    function rankArticles(query, articles) {
        try {
            // Build prompt
            let articlesText = 'Available articles:\n\n';
            articles.forEach((article, index) => {
                articlesText += (index + 1) + '. ' + article.title + '\n';
                articlesText += '   Summary: ' + article.summary + '\n';
                articlesText += '   Keywords: ' + article.keywords.join(', ') + '\n\n';
            });

            const prompt = `You are a search ranking system for AGSuite NetSuite documentation.

User Query: "${query}"

${articlesText}

Rank the articles by relevance to the user's query. Return ONLY the article numbers in order of relevance (most relevant first), separated by commas.

Only include articles that are actually relevant to the query. If no articles are relevant, return "NONE".

Your ranking:`;

            log.debug('LLM Prompt', 'Query: ' + query);

            // Call LLM
            const response = llm.evaluatePrompt({
                model: LLM_CONFIG.model,
                maxTokens: 100,
                temperature: 0.1,
                prompt: prompt
            });

            const rankingText = response.choices[0].message.content.trim();
            log.debug('LLM Ranking', rankingText);

            if (rankingText === 'NONE' || !rankingText) {
                return [];
            }

            // Parse rankings
            const rankings = rankingText.split(',')
                .map(num => parseInt(num.trim()))
                .filter(num => !isNaN(num));

            // Build ranked results
            const rankedArticles = [];
            rankings.forEach(rank => {
                if (rank > 0 && rank <= articles.length) {
                    rankedArticles.push(articles[rank - 1]);
                }
            });

            return rankedArticles.slice(0, LLM_CONFIG.maxSearchResults);

        } catch (e) {
            log.error('LLM Ranking Failed', e.toString());
            // Fallback to keyword search
            return simpleKeywordSearch(query, articles);
        }
    }

    /**
     * Fallback keyword search
     */
    function simpleKeywordSearch(query, articles) {
        const queryWords = query.toLowerCase().split(' ');

        const scored = articles.map(article => {
            let score = 0;
            const titleLower = article.title.toLowerCase();
            const summaryLower = article.summary.toLowerCase();
            const keywordsLower = article.keywords.map(k => k.toLowerCase());

            queryWords.forEach(word => {
                if (titleLower.includes(word)) score += 3;
                if (summaryLower.includes(word)) score += 2;
                if (keywordsLower.some(k => k.includes(word))) score += 1;
            });

            return { article, score };
        });

        return scored
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, LLM_CONFIG.maxSearchResults)
            .map(item => item.article);
    }

    /**
     * Format search results as HTML
     */
    function formatSearchResults(articles, query) {
        if (!articles || articles.length === 0) {
            return '<div class="no-results">' +
                   '<p>No articles found for: <strong>' + escapeHtml(query) + '</strong></p>' +
                   '<p class="hint">Try different keywords or ask a question.</p>' +
                   '</div>';
        }

        let html = '<div class="search-results">';
        html += '<div class="results-header">';
        html += '<p>Found ' + articles.length + ' relevant article' + (articles.length > 1 ? 's' : '') + ' for: <strong>' + escapeHtml(query) + '</strong></p>';
        html += '</div>';

        articles.forEach((article, index) => {
            // Use file_id if available, otherwise use id as fallback
            const fileId = article.file_id || article.id;

            html += '<div class="result-item" onclick="loadArticle(\'' + fileId + '\', \'' + escapeHtml(article.title) + '\')">';
            html += '<div class="result-number">' + (index + 1) + '</div>';
            html += '<div class="result-content">';
            html += '<h3 class="result-title">' + article.title + '</h3>';
            html += '<p class="result-summary">' + article.summary + '</p>';
            html += '<div class="result-keywords">';
            article.keywords.slice(0, 5).forEach(keyword => {
                html += '<span class="keyword-tag">' + keyword + '</span>';
            });
            html += '</div>';
            html += '</div>';
            html += '<div class="result-arrow">→</div>';
            html += '</div>';
        });

        html += '</div>';
        return html;
    }

    /**
     * Format article content with dynamic URLs
     */
    function formatArticleContent(articleContent, articleTitle) {
        // CRITICAL: Process placeholders FIRST
        const processedContent = processArticlePlaceholders(articleContent);

        let html = '<div class="article-view">';
        html += '<div class="article-header">';
        html += '<button class="back-button" onclick="goBackToSearch()">← Back to Search Results</button>';
        html += '<h2>' + articleTitle + '</h2>';
        html += '</div>';
        html += '<div class="article-body">';

        // Convert text to HTML
        const lines = processedContent.split('\n');
        let inList = false;
        let listType = null;

        lines.forEach(line => {
            line = line.trim();

            if (line === '') {
                if (inList) {
                    html += '</' + listType + '>';
                    inList = false;
                    listType = null;
                }
                html += '<br>';
            } else if (line.toUpperCase() === line && line.length > 10 && !line.includes(':') && !line.includes('<')) {
                // All caps = heading
                if (inList) {
                    html += '</' + listType + '>';
                    inList = false;
                    listType = null;
                }
                html += '<h3>' + line + '</h3>';
            } else if (line.match(/^[-•]\s/)) {
                // Bullet point
                if (!inList || listType !== 'ul') {
                    if (inList) html += '</' + listType + '>';
                    html += '<ul>';
                    inList = true;
                    listType = 'ul';
                }
                html += '<li>' + line.substring(2) + '</li>';
            } else if (line.match(/^\d+\.\s/)) {
                // Numbered list
                if (!inList || listType !== 'ol') {
                    if (inList) html += '</' + listType + '>';
                    html += '<ol>';
                    inList = true;
                    listType = 'ol';
                }
                const dotIndex = line.indexOf('.');
                html += '<li>' + line.substring(dotIndex + 2) + '</li>';
            } else {
                if (inList) {
                    html += '</' + listType + '>';
                    inList = false;
                    listType = null;
                }
                html += '<p>' + line + '</p>';
            }
        });

        if (inList) {
            html += '</' + listType + '>';
        }

        html += '</div>';
        html += '<div class="article-footer">';
        html += '<button class="back-button" onclick="goBackToSearch()">← Back to Search Results</button>';
        html += '</div>';
        html += '</div>';

        return html;
    }

    /**
     * Build main UI
     */
    function buildUI() {
        const scriptUrl = url.resolveScript({
            scriptId: runtime.getCurrentScript().id,
            deploymentId: runtime.getCurrentScript().deploymentId,
            returnExternalUrl: false
        });

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>AGSuite Knowledge Assistant</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            height: 90vh;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 24px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        }

        .header h1 {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 8px;
        }

        .header p {
            font-size: 14px;
            opacity: 0.9;
        }

        .chat-area {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
            background: #f7fafc;
        }

        .welcome-message {
            background: white;
            border-left: 4px solid #667eea;
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .welcome-message h3 {
            color: #2d3748;
            font-size: 16px;
            margin-bottom: 8px;
        }

        .welcome-message p {
            color: #4a5568;
            font-size: 14px;
            line-height: 1.6;
        }

        .search-results {
            margin-top: 20px;
        }

        .results-header {
            margin-bottom: 16px;
        }

        .results-header p {
            color: #4a5568;
            font-size: 14px;
        }

        .result-item {
            background: white;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
            cursor: pointer;
            transition: all 0.2s;
            border: 2px solid transparent;
            display: flex;
            align-items: flex-start;
            gap: 16px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .result-item:hover {
            border-color: #667eea;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
            transform: translateY(-2px);
        }

        .result-number {
            background: #667eea;
            color: white;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            font-size: 14px;
            flex-shrink: 0;
        }

        .result-content {
            flex: 1;
        }

        .result-title {
            color: #2d3748;
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 8px;
        }

        .result-summary {
            color: #718096;
            font-size: 14px;
            line-height: 1.5;
            margin-bottom: 10px;
        }

        .result-keywords {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }

        .keyword-tag {
            background: #edf2f7;
            color: #4a5568;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
        }

        .result-arrow {
            color: #cbd5e0;
            font-size: 20px;
            font-weight: bold;
            flex-shrink: 0;
        }

        .result-item:hover .result-arrow {
            color: #667eea;
        }

        .article-view {
            background: white;
            border-radius: 8px;
            padding: 24px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .article-header {
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 2px solid #e2e8f0;
        }

        .article-header h2 {
            color: #2d3748;
            font-size: 24px;
            margin-top: 16px;
        }

        .back-button {
            background: #edf2f7;
            color: #4a5568;
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
        }

        .back-button:hover {
            background: #e2e8f0;
            color: #2d3748;
        }

        .article-body {
            color: #2d3748;
            line-height: 1.8;
        }

        .article-body h3 {
            color: #2d3748;
            font-size: 18px;
            margin: 24px 0 12px 0;
            padding-bottom: 8px;
            border-bottom: 2px solid #edf2f7;
        }

        .article-body p {
            margin-bottom: 12px;
            color: #4a5568;
            font-size: 14px;
        }

        .article-body ul, .article-body ol {
            margin-left: 20px;
            margin-bottom: 16px;
        }

        .article-body li {
            margin-bottom: 8px;
            color: #4a5568;
            font-size: 14px;
            line-height: 1.6;
        }

        .article-footer {
            margin-top: 32px;
            padding-top: 16px;
            border-top: 2px solid #e2e8f0;
        }

        /* Dynamic Link Styles */
        .create-button {
            display: inline-block;
            background: #48bb78;
            color: white !important;
            padding: 10px 18px;
            border-radius: 6px;
            text-decoration: none;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s;
            margin: 4px 4px 4px 0;
            box-shadow: 0 2px 4px rgba(72, 187, 120, 0.3);
        }

        .create-button:hover {
            background: #38a169;
            box-shadow: 0 4px 8px rgba(72, 187, 120, 0.4);
            transform: translateY(-1px);
        }

        .list-link, .edit-link {
            color: #3182ce !important;
            text-decoration: none;
            font-weight: 600;
            border-bottom: 2px dashed #3182ce;
            padding-bottom: 2px;
            transition: all 0.2s;
        }

        .list-link:hover, .edit-link:hover {
            color: #2c5282 !important;
            border-bottom-style: solid;
        }

        .error-placeholder {
            background: #fed7d7;
            color: #c53030;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }

        .no-results {
            background: white;
            border-radius: 8px;
            padding: 32px;
            text-align: center;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .no-results p {
            color: #718096;
            font-size: 16px;
            margin-bottom: 12px;
        }

        .no-results .hint {
            color: #a0aec0;
            font-size: 14px;
        }

        .input-area {
            padding: 20px 24px;
            background: white;
            border-top: 1px solid #e2e8f0;
        }

        .input-container {
            display: flex;
            gap: 12px;
        }

        #searchInput {
            flex: 1;
            padding: 14px 18px;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-size: 14px;
            transition: all 0.2s;
            font-family: inherit;
        }

        #searchInput:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        #searchButton {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 14px 28px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        #searchButton:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
        }

        #searchButton:disabled {
            background: #cbd5e0;
            cursor: not-allowed;
            box-shadow: none;
        }

        .loading {
            text-align: center;
            padding: 40px;
        }

        .loading-spinner {
            border: 4px solid #e2e8f0;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 16px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .chat-area::-webkit-scrollbar {
            width: 8px;
        }

        .chat-area::-webkit-scrollbar-track {
            background: #edf2f7;
        }

        .chat-area::-webkit-scrollbar-thumb {
            background: #cbd5e0;
            border-radius: 4px;
        }

        @media (max-width: 768px) {
            body { padding: 10px; }
            .container { height: 95vh; border-radius: 12px; }
            .header { padding: 16px; }
            .chat-area { padding: 16px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>AGSuite Knowledge Assistant</h1>
            <p>AI-powered documentation and support for NetSuite taxation</p>
        </div>

        <div class="chat-area" id="chatArea">
            <div class="welcome-message">
                <h3>👋 Welcome to AGSuite Knowledge Base!</h3>
                <p>I can help you find documentation about GST, TDS, invoicing, and more.</p>
                <p style="margin-top: 8px;"><strong>Try asking:</strong> "TDS payment" or "How to create e-invoice?"</p>
            </div>
        </div>

        <div class="input-area">
            <div class="input-container">
                <input
                    type="text"
                    id="searchInput"
                    placeholder="Search documentation or ask a question..."
                    autocomplete="off"
                />
                <button id="searchButton" onclick="performSearch()">Search</button>
            </div>
        </div>
    </div>

    <script>
        const SUITELET_URL = '${scriptUrl}';
        let currentSearchResults = null;
        let currentQuery = null;

        document.getElementById('searchInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') performSearch();
        });

        window.onload = function() {
            document.getElementById('searchInput').focus();
        };

        function performSearch() {
            const query = document.getElementById('searchInput').value.trim();
            if (!query) {
                alert('Please enter a search query');
                return;
            }

            currentQuery = query;
            showLoading();

            const btn = document.getElementById('searchButton');
            btn.disabled = true;
            btn.textContent = 'Searching...';

            const url = SUITELET_URL + '&action=search&query=' + encodeURIComponent(query);

            fetch(url)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        currentSearchResults = data.results;
                        displaySearchResults(data.html);
                    } else {
                        showError(data.error || 'Search failed');
                    }
                })
                .catch(error => {
                    console.error('Search error:', error);
                    showError('Network error. Please try again.');
                })
                .finally(() => {
                    btn.disabled = false;
                    btn.textContent = 'Search';
                });
        }

        function loadArticle(fileId, title) {
            showLoading();
            const url = SUITELET_URL + '&action=getArticle&fileId=' + fileId + '&title=' + encodeURIComponent(title);

            fetch(url)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        displayArticle(data.html);
                    } else {
                        showError(data.error || 'Failed to load article');
                    }
                })
                .catch(error => {
                    console.error('Load article error:', error);
                    showError('Network error. Please try again.');
                });
        }

        function goBackToSearch() {
            if (currentQuery && currentSearchResults) {
                const html = formatSearchResults(currentSearchResults, currentQuery);
                displaySearchResults(html);
            } else {
                location.reload();
            }
        }

        function displaySearchResults(html) {
            document.getElementById('chatArea').innerHTML = html;
            document.getElementById('chatArea').scrollTop = 0;
        }

        function displayArticle(html) {
            document.getElementById('chatArea').innerHTML = html;
            document.getElementById('chatArea').scrollTop = 0;
        }

        function showLoading() {
            document.getElementById('chatArea').innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Searching knowledge base...</p></div>';
        }

        function showError(message) {
            document.getElementById('chatArea').innerHTML = '<div class="no-results"><p>⚠️ ' + escapeHtml(message) + '</p><p class="hint">Please try again.</p></div>';
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function formatSearchResults(results, query) {
            if (!results || results.length === 0) {
                return '<div class="no-results"><p>No articles found for: <strong>' + escapeHtml(query) + '</strong></p><p class="hint">Try different keywords.</p></div>';
            }

            let html = '<div class="search-results">';
            html += '<div class="results-header"><p>Found ' + results.length + ' relevant article' + (results.length > 1 ? 's' : '') + ' for: <strong>' + escapeHtml(query) + '</strong></p></div>';

            results.forEach(function(article, index) {
                const fileId = article.file_id || article.id;
                html += '<div class="result-item" onclick="loadArticle(\\'' + fileId + '\\', \\'' + escapeHtml(article.title) + '\\')">';
                html += '<div class="result-number">' + (index + 1) + '</div>';
                html += '<div class="result-content">';
                html += '<h3 class="result-title">' + article.title + '</h3>';
                html += '<p class="result-summary">' + article.summary + '</p>';
                html += '<div class="result-keywords">';
                article.keywords.slice(0, 5).forEach(function(k) {
                    html += '<span class="keyword-tag">' + k + '</span>';
                });
                html += '</div></div>';
                html += '<div class="result-arrow">→</div></div>';
            });

            html += '</div>';
            return html;
        }
    </script>
</body>
</html>
        `;
    }

    /**
     * Escape HTML
     */
    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Main onRequest handler
     */
    function onRequest(context) {
        try {
            const action = context.request.parameters.action;

            if (action === 'search') {
                const query = context.request.parameters.query;

                if (!query) {
                    context.response.write(JSON.stringify({
                        success: false,
                        error: 'No query provided'
                    }));
                    return;
                }

                log.audit('Search Request', 'Query: ' + query);

                const articles = loadArticlesIndex();

                if (!articles || articles.length === 0) {
                    context.response.write(JSON.stringify({
                        success: false,
                        error: 'Knowledge base not available'
                    }));
                    return;
                }

                const rankedArticles = rankArticles(query, articles);
                const html = formatSearchResults(rankedArticles, query);

                context.response.write(JSON.stringify({
                    success: true,
                    html: html,
                    results: rankedArticles
                }));

            } else if (action === 'getArticle') {
                const fileId = context.request.parameters.fileId;
                const title = context.request.parameters.title;

                if (!fileId) {
                    context.response.write(JSON.stringify({
                        success: false,
                        error: 'No file ID provided'
                    }));
                    return;
                }

                log.audit('Load Article', 'File ID: ' + fileId);

                const content = loadArticleContent(fileId);
                const html = formatArticleContent(content, title || 'Article');

                context.response.write(JSON.stringify({
                    success: true,
                    html: html
                }));

            } else {
                // Initial page load
                context.response.write(buildUI());
            }

        } catch (e) {
            log.error('Suitelet Error', e.toString());

            if (context.request.parameters.action) {
                context.response.write(JSON.stringify({
                    success: false,
                    error: 'Internal server error: ' + e.message
                }));
            } else {
                context.response.write('<html><body><h1>Error</h1><p>' + escapeHtml(e.message) + '</p></body></html>');
            }
        }
    }

    return {
        onRequest: onRequest
    };
});
