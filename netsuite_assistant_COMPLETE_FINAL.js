/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * PRODUCTION-READY AI KNOWLEDGE BASE ASSISTANT
 * Features:
 * - LLM-powered article search and ranking
 * - Dynamic multi-client URL generation
 * - TDS & AG Tax module integration
 * - Conversation state management
 * - Token-efficient AI architecture
 *
 * DEPLOYMENT: Single codebase for all clients
 * CONFIGURATION: Update URL_MAPPINGS per client (Lines 30-120)
 */

define(['N/ui/serverWidget', 'N/file', 'N/llm', 'N/log', 'N/runtime', 'N/url'],
    function(serverWidget, file, llm, log, runtime, url) {

    // ========================================
    // CONFIGURATION - UPDATE PER CLIENT
    // ========================================

    const KNOWLEDGE_BASE = {
        INDEX_FILE_ID: '3164', // CHANGE: Your articles_index.json Internal ID
        FOLDER_PATH: '/SuiteScripts/Knowledge Base/' // Articles folder path
    };

    // ========================================
    // DYNAMIC URL MAPPINGS - UPDATE PER CLIENT
    // ========================================
    // For each client deployment:
    // 1. Find rectype IDs: Go to custom record list, check URL
    // 2. Update createUrl and listUrl with client's rectypes
    // 3. Standard records (invoice, customer) work automatically

    const URL_MAPPINGS = {
        // TDS Related Records
        TDS_MASTER: {
            recordType: 'customrecord_agtax_tdsmaster',
            createUrl: '/app/common/custom/custrecordentry.nl?rectype=1042', // UPDATE per client
            listUrl: '/app/common/custom/custrecordentrylist.nl?rectype=1042', // UPDATE per client
            label: 'TDS Master'
        },

        TDS_SECTIONS: {
            recordType: 'customrecord_agtax_tds_section',
            createUrl: '/app/common/custom/custrecordentry.nl?rectype=1043', // UPDATE per client
            listUrl: '/app/common/custom/custrecordentrylist.nl?rectype=1043', // UPDATE per client
            label: 'TDS Sections'
        },

        TDS_PAYMENT: {
            recordType: 'customrecord_agtax_tds_payment',
            createUrl: '/app/common/custom/custrecordentry.nl?rectype=1044', // UPDATE per client
            listUrl: '/app/common/custom/custrecordentrylist.nl?rectype=1044', // UPDATE per client
            label: 'TDS Payment'
        },

        TDS_CHALLAN: {
            recordType: 'customrecord_agtax_tds_challan',
            createUrl: '/app/common/custom/custrecordentry.nl?rectype=1045', // UPDATE per client
            listUrl: '/app/common/custom/custrecordentrylist.nl?rectype=1045', // UPDATE per client
            label: 'TDS Challan'
        },

        // AG Tax Related Records
        AGTAX_MATRIX: {
            recordType: 'customrecord_agtax_code_matrix',
            createUrl: '/app/common/custom/custrecordentry.nl?rectype=1028', // UPDATE per client
            listUrl: '/app/common/custom/custrecordentrylist.nl?rectype=1028', // UPDATE per client
            label: 'AG Tax Code Matrix'
        },

        AGTAX_CONFIGURATION: {
            recordType: 'customrecord_agtax_configuration',
            createUrl: '/app/common/custom/custrecordentry.nl?rectype=1029', // UPDATE per client
            listUrl: '/app/common/custom/custrecordentrylist.nl?rectype=1029', // UPDATE per client
            label: 'AG Tax Configuration'
        },

        // Standard NetSuite Records (work automatically)
        TAX_CODES: {
            recordType: 'salestaxitem',
            label: 'Tax Codes'
        },

        CUSTOMERS: {
            recordType: 'customer',
            label: 'Customers'
        },

        VENDORS: {
            recordType: 'vendor',
            label: 'Vendors'
        },

        INVOICES: {
            recordType: 'invoice',
            label: 'Sales Invoices'
        },

        VENDOR_BILLS: {
            recordType: 'vendorbill',
            label: 'Vendor Bills'
        },

        PAYMENT_TRANSACTIONS: {
            recordType: 'vendorpayment',
            label: 'Vendor Payments'
        },

        JOURNAL_ENTRIES: {
            recordType: 'journalentry',
            label: 'Journal Entries'
        },

        // Reports and Other Pages
        REPORTS_TDS: {
            label: 'TDS Reports',
            customUrl: '/app/center/card.nl?sc=-29' // UPDATE if different
        },

        REPORTS_AGTAX: {
            label: 'AG Tax Reports',
            customUrl: '/app/center/card.nl?sc=-29' // UPDATE if different
        }
    };

    // ========================================
    // GLOBAL CONFIGURATION
    // ========================================

    const CONFIG = {
        // LLM Settings
        LLM_MODEL: 'oracle/cohere-command-r-16k', // Default NetSuite LLM model
        MAX_TOKENS: 300,
        TEMPERATURE: 0.3,

        // Search Settings
        MAX_SEARCH_RESULTS: 7,
        MIN_RELEVANCE_SCORE: 0.3,

        // Cache Settings
        ENABLE_CACHE: true,
        CACHE_SIZE: 50,

        // UI Settings
        CHATBOT_TITLE: 'AGTAX Knowledge Assistant',
        WELCOME_MESSAGE: 'Hello! I can help you with AGTAX documentation and NetSuite taxation queries. How can I assist you today?',

        // URLs
        SUITELET_URL: url.resolveScript({
            scriptId: 'customscript_agtax_assistant_sl',
            deploymentId: 'customdeploy_agtax_assistant_sl',
            returnExternalUrl: false
        }),

        // Modules
        MODULES: {
            TDS: {
                name: 'TDS (Tax Deducted at Source)',
                helpUrl: '/app/help/helpcenter.nl?fid=section_1545067888.html'
            },
            AGTAX: {
                name: 'AG Tax Suite',
                helpUrl: '/app/help/helpcenter.nl?fid=section_agtax.html'
            }
        }
    };

    // ========================================
    // CACHE FOR PERFORMANCE
    // ========================================

    const searchCache = new Map();
    const articleCache = new Map();

    /**
     * Process article content and replace placeholders with dynamic URLs
     * Placeholders: [CREATE:RESOURCE], [LIST:RESOURCE], [EDIT:RESOURCE:ID], [NAV:RESOURCE]
     *
     * @param {string} articleContent - Raw article text with placeholders
     * @returns {string} - Processed HTML with working links/buttons
     */
    function processArticlePlaceholders(articleContent) {
        if (!articleContent) return '';

        let processedContent = articleContent;

        // Regular expression to find placeholders: [ACTION:RESOURCE] or [ACTION:RESOURCE:PARAM]
        const placeholderRegex = /\[(CREATE|LIST|EDIT|VIEW|NAV):([A-Z_]+)(?::([^\]]+))?\]/g;

        processedContent = processedContent.replace(placeholderRegex, function(match, action, resource, param) {
            try {
                const mapping = URL_MAPPINGS[resource];

                if (!mapping) {
                    log.warning({
                        title: 'Placeholder Not Found',
                        details: 'Resource: ' + resource + ' in placeholder: ' + match
                    });
                    return '<span class="error-placeholder" title="Configuration needed for: ' + resource + '">[' + resource + ' not configured]</span>';
                }

                let generatedUrl = '';
                let linkText = '';
                let linkClass = '';
                let isButton = false;

                switch(action) {
                    case 'CREATE':
                        if (mapping.createUrl) {
                            // Use configured URL (for custom records)
                            generatedUrl = mapping.createUrl;
                        } else if (mapping.customUrl) {
                            generatedUrl = mapping.customUrl;
                        } else {
                            // Use URL resolver (for standard records)
                            try {
                                generatedUrl = url.resolveRecord({
                                    recordType: mapping.recordType,
                                    isEdit: false
                                });
                            } catch (e) {
                                log.error({
                                    title: 'URL Resolve Error - CREATE',
                                    details: 'Resource: ' + resource + ', Error: ' + e.toString()
                                });
                                generatedUrl = '#error-' + resource;
                            }
                        }
                        linkText = 'Create ' + mapping.label;
                        linkClass = 'create-button';
                        isButton = true;
                        break;

                    case 'LIST':
                    case 'VIEW':
                        if (mapping.listUrl) {
                            // Use configured URL (for custom records)
                            generatedUrl = mapping.listUrl;
                        } else if (mapping.customUrl) {
                            generatedUrl = mapping.customUrl;
                        } else {
                            // For standard records, try to build list URL
                            try {
                                // Some standard record types need special handling
                                if (mapping.recordType === 'customer') {
                                    generatedUrl = '/app/common/entity/custjob.nl?e=T';
                                } else if (mapping.recordType === 'vendor') {
                                    generatedUrl = '/app/common/entity/vendorlist.nl';
                                } else if (mapping.recordType === 'invoice') {
                                    generatedUrl = '/app/accounting/transactions/transactionlist.nl?Transaction_TYPE=CustInvc';
                                } else if (mapping.recordType === 'vendorbill') {
                                    generatedUrl = '/app/accounting/transactions/transactionlist.nl?Transaction_TYPE=VendBill';
                                } else {
                                    // Generic approach - may not work for all record types
                                    generatedUrl = '/app/common/search/searchresults.nl?searchtype=' + mapping.recordType;
                                }
                            } catch (e) {
                                log.error({
                                    title: 'URL Resolve Error - LIST',
                                    details: 'Resource: ' + resource + ', Error: ' + e.toString()
                                });
                                generatedUrl = '#error-' + resource;
                            }
                        }
                        linkText = action === 'LIST' ? 'View All ' + mapping.label : 'View ' + mapping.label;
                        linkClass = 'list-link';
                        break;

                    case 'EDIT':
                        if (!param) {
                            return '<span class="error-placeholder" title="EDIT requires record ID">[EDIT:' + resource + ' requires ID parameter]</span>';
                        }
                        try {
                            generatedUrl = url.resolveRecord({
                                recordType: mapping.recordType,
                                recordId: param,
                                isEdit: true
                            });
                        } catch (e) {
                            log.error({
                                title: 'URL Resolve Error - EDIT',
                                details: 'Resource: ' + resource + ', ID: ' + param + ', Error: ' + e.toString()
                            });
                            generatedUrl = '#error-' + resource;
                        }
                        linkText = 'Edit ' + mapping.label;
                        linkClass = 'edit-link';
                        break;

                    case 'NAV':
                        if (mapping.customUrl) {
                            generatedUrl = mapping.customUrl;
                        } else {
                            generatedUrl = '#nav-' + resource;
                        }
                        linkText = mapping.label;
                        linkClass = 'nav-link';
                        break;

                    default:
                        return match; // Return original if unknown action
                }

                // Generate HTML
                if (isButton) {
                    return '<a href="' + generatedUrl + '" target="_blank" class="' + linkClass + '" title="Opens in new window">' + linkText + '</a>';
                } else {
                    return '<a href="' + generatedUrl + '" target="_blank" class="' + linkClass + '">' + linkText + '</a>';
                }

            } catch (e) {
                log.error({
                    title: 'Placeholder Processing Error',
                    details: 'Match: ' + match + ', Error: ' + e.toString()
                });
                return '<span class="error-placeholder" title="Error processing placeholder">[Error: ' + match + ']</span>';
            }
        });

        return processedContent;
    }

    /**
     * Load and parse the articles index from JSON file
     * @returns {Array} Array of article objects
     */
    function loadArticlesIndex() {
        try {
            const jsonFile = file.load({
                id: KNOWLEDGE_BASE.INDEX_FILE_ID
            });

            const content = jsonFile.getContents();
            const index = JSON.parse(content);

            log.audit({
                title: 'Articles Index Loaded',
                details: 'Loaded ' + index.articles.length + ' articles from index'
            });

            return index.articles;

        } catch (e) {
            log.error({
                title: 'Failed to Load Articles Index',
                details: e.toString()
            });
            return [];
        }
    }

    /**
     * Load full article content from File Cabinet
     * @param {string} fileId - Internal ID of article file
     * @returns {string} Article content
     */
    function loadArticleContent(fileId) {
        // Check cache first
        if (CONFIG.ENABLE_CACHE && articleCache.has(fileId)) {
            log.debug({
                title: 'Article Cache Hit',
                details: 'File ID: ' + fileId
            });
            return articleCache.get(fileId);
        }

        try {
            const articleFile = file.load({
                id: fileId
            });

            const content = articleFile.getContents();

            // Cache the result
            if (CONFIG.ENABLE_CACHE) {
                if (articleCache.size >= CONFIG.CACHE_SIZE) {
                    // Simple cache eviction - remove first entry
                    const firstKey = articleCache.keys().next().value;
                    articleCache.delete(firstKey);
                }
                articleCache.set(fileId, content);
            }

            return content;

        } catch (e) {
            log.error({
                title: 'Failed to Load Article Content',
                details: 'File ID: ' + fileId + ', Error: ' + e.toString()
            });
            return 'Error loading article content. Please contact support.';
        }
    }

    /**
     * Detect if query is a question or search term
     * @param {string} query - User input
     * @returns {Object} {isQuestion: boolean, intent: string}
     */
    function detectIntent(query) {
        const questionWords = ['what', 'how', 'when', 'where', 'why', 'who', 'which', 'can', 'should', 'is', 'are', 'do', 'does'];
        const lowerQuery = query.toLowerCase().trim();

        // Check for question marks
        if (lowerQuery.includes('?')) {
            return { isQuestion: true, intent: 'question' };
        }

        // Check for question words at start
        const firstWord = lowerQuery.split(' ')[0];
        if (questionWords.includes(firstWord)) {
            return { isQuestion: true, intent: 'question' };
        }

        // Check length and structure
        if (lowerQuery.split(' ').length > 5) {
            return { isQuestion: true, intent: 'question' };
        }

        return { isQuestion: false, intent: 'search' };
    }

    /**
     * Rank articles using LLM based on query relevance
     * @param {string} query - User search query
     * @param {Array} articles - Array of article objects from index
     * @returns {Array} Sorted array of relevant articles
     */
    function rankArticles(query, articles) {
        // Check cache first
        const cacheKey = query.toLowerCase().trim();
        if (CONFIG.ENABLE_CACHE && searchCache.has(cacheKey)) {
            log.debug({
                title: 'Search Cache Hit',
                details: 'Query: ' + query
            });
            return searchCache.get(cacheKey);
        }

        try {
            // Build prompt for LLM
            let articlesText = 'Available articles:\n\n';
            articles.forEach((article, index) => {
                articlesText += (index + 1) + '. ' + article.title + '\n';
                articlesText += '   Summary: ' + article.summary + '\n';
                articlesText += '   Keywords: ' + article.keywords.join(', ') + '\n\n';
            });

            const prompt = `You are a search ranking system for AGTAX NetSuite documentation.

User Query: "${query}"

${articlesText}

Rank the articles by relevance to the user's query. Return ONLY the article numbers in order of relevance (most relevant first), separated by commas.
For example: 3,7,1,5

Only include articles that are actually relevant to the query. If no articles are relevant, return "NONE".

Your ranking:`;

            // Call LLM for ranking
            const response = llm.evaluatePrompt({
                model: CONFIG.LLM_MODEL,
                maxTokens: 100,
                temperature: 0.1, // Low temperature for consistent ranking
                prompt: prompt
            });

            const rankingText = response.choices[0].message.content.trim();

            log.debug({
                title: 'LLM Ranking Response',
                details: 'Query: "' + query + '", Rankings: ' + rankingText
            });

            // Parse the ranking
            if (rankingText === 'NONE' || !rankingText) {
                return [];
            }

            const rankings = rankingText.split(',').map(num => parseInt(num.trim())).filter(num => !isNaN(num));

            // Build ranked results
            const rankedArticles = [];
            rankings.forEach(rank => {
                if (rank > 0 && rank <= articles.length) {
                    rankedArticles.push(articles[rank - 1]);
                }
            });

            // Limit results
            const limitedResults = rankedArticles.slice(0, CONFIG.MAX_SEARCH_RESULTS);

            // Cache the result
            if (CONFIG.ENABLE_CACHE) {
                if (searchCache.size >= CONFIG.CACHE_SIZE) {
                    const firstKey = searchCache.keys().next().value;
                    searchCache.delete(firstKey);
                }
                searchCache.set(cacheKey, limitedResults);
            }

            return limitedResults;

        } catch (e) {
            log.error({
                title: 'LLM Ranking Failed',
                details: 'Query: ' + query + ', Error: ' + e.toString()
            });

            // Fallback: Simple keyword matching
            return simpleKeywordSearch(query, articles);
        }
    }

    /**
     * Fallback: Simple keyword-based search
     * @param {string} query - Search query
     * @param {Array} articles - Articles array
     * @returns {Array} Matching articles
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
            .slice(0, CONFIG.MAX_SEARCH_RESULTS)
            .map(item => item.article);
    }

    /**
     * Generate AI answer to a question using relevant articles
     * @param {string} question - User's question
     * @param {Array} relevantArticles - Array of relevant article objects
     * @returns {string} AI-generated answer
     */
    function generateAnswer(question, relevantArticles) {
        try {
            // Load content of top 2-3 relevant articles
            let contextText = 'Documentation context:\n\n';
            const articlesToUse = relevantArticles.slice(0, 3);

            articlesToUse.forEach(article => {
                const content = loadArticleContent(article.file_id);
                contextText += '--- ' + article.title + ' ---\n';
                contextText += content.substring(0, 2000); // Limit content length
                contextText += '\n\n';
            });

            const prompt = `You are an AGTAX NetSuite assistant. Answer the user's question based on the documentation provided.

Documentation:
${contextText}

User Question: ${question}

Provide a clear, concise answer based on the documentation. If the documentation doesn't contain enough information, say so.

Answer:`;

            const response = llm.evaluatePrompt({
                model: CONFIG.LLM_MODEL,
                maxTokens: CONFIG.MAX_TOKENS,
                temperature: CONFIG.TEMPERATURE,
                prompt: prompt
            });

            return response.choices[0].message.content.trim();

        } catch (e) {
            log.error({
                title: 'Answer Generation Failed',
                details: e.toString()
            });
            return 'I encountered an error generating an answer. Please try rephrasing your question or browse the documentation.';
        }
    }

    /**
     * Format search results as HTML
     * @param {Array} articles - Ranked articles
     * @param {string} query - Original search query
     * @returns {string} HTML string
     */
    function formatSearchResults(articles, query) {
        if (!articles || articles.length === 0) {
            return '<div class="no-results">' +
                   '<p>No articles found for: <strong>' + escapeHtml(query) + '</strong></p>' +
                   '<p class="hint">Try different keywords or ask a question instead.</p>' +
                   '</div>';
        }

        let html = '<div class="search-results">';
        html += '<div class="results-header">';
        html += '<p>Found ' + articles.length + ' relevant article' + (articles.length > 1 ? 's' : '') + ' for: <strong>' + escapeHtml(query) + '</strong></p>';
        html += '</div>';

        articles.forEach((article, index) => {
            html += '<div class="result-item" onclick="loadArticle(\'' + article.file_id + '\', \'' + escapeHtml(article.title) + '\')">';
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
     * Format full article content for display with dynamic URLs
     * @param {string} articleContent - Raw article text
     * @param {string} articleTitle - Article title
     * @returns {string} HTML string
     */
    function formatArticleContent(articleContent, articleTitle) {
        // CRITICAL: Process placeholders FIRST before any HTML formatting
        const processedContent = processArticlePlaceholders(articleContent);

        let html = '<div class="article-view">';
        html += '<div class="article-header">';
        html += '<button class="back-button" onclick="goBackToSearch()">← Back to Search Results</button>';
        html += '<h2>' + articleTitle + '</h2>';
        html += '</div>';
        html += '<div class="article-body">';

        // Convert article content to HTML (simple formatting)
        const lines = processedContent.split('\n');
        let inList = false;
        let listType = null; // 'ul' or 'ol'

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
                // All caps line = heading (but not if it has HTML from our placeholders)
                if (inList) {
                    html += '</' + listType + '>';
                    inList = false;
                    listType = null;
                }
                html += '<h3>' + line + '</h3>';
            } else if (line.match(/^[-•]\s/)) {
                // Unordered list item
                if (!inList || listType !== 'ul') {
                    if (inList) html += '</' + listType + '>';
                    html += '<ul>';
                    inList = true;
                    listType = 'ul';
                }
                html += '<li>' + line.substring(2) + '</li>';
            } else if (line.match(/^\d+\.\s/)) {
                // Ordered list item
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
     * Build main UI HTML
     * @returns {string} Complete HTML for chatbot interface
     */
    function buildUI() {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${CONFIG.CHATBOT_TITLE}</title>
    <style>
        /* Reset and Base Styles */
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

        /* Main Container */
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

        /* Header */
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

        /* Chat Area */
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

        /* Search Results */
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

        /* Article View */
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

        .list-link, .edit-link, .nav-link {
            color: #3182ce !important;
            text-decoration: none;
            font-weight: 600;
            border-bottom: 2px dashed #3182ce;
            padding-bottom: 2px;
            transition: all 0.2s;
        }

        .list-link:hover, .edit-link:hover, .nav-link:hover {
            color: #2c5282 !important;
            border-bottom-style: solid;
            border-bottom-color: #2c5282;
        }

        .error-placeholder {
            background: #fed7d7;
            color: #c53030;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            border: 1px solid #fc8181;
        }

        /* No Results */
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

        /* Input Area */
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

        #searchButton:active {
            transform: translateY(0);
        }

        #searchButton:disabled {
            background: #cbd5e0;
            cursor: not-allowed;
            box-shadow: none;
        }

        /* Loading State */
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

        .loading p {
            color: #718096;
            font-size: 14px;
        }

        /* Scrollbar Styling */
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

        .chat-area::-webkit-scrollbar-thumb:hover {
            background: #a0aec0;
        }

        /* Responsive */
        @media (max-width: 768px) {
            body {
                padding: 10px;
            }

            .container {
                height: 95vh;
                border-radius: 12px;
            }

            .header {
                padding: 16px;
            }

            .header h1 {
                font-size: 20px;
            }

            .chat-area {
                padding: 16px;
            }

            .result-item {
                flex-direction: column;
                gap: 12px;
            }

            .result-arrow {
                display: none;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${CONFIG.CHATBOT_TITLE}</h1>
            <p>AI-powered documentation and support for NetSuite taxation</p>
        </div>

        <div class="chat-area" id="chatArea">
            <div class="welcome-message">
                <h3>👋 Welcome!</h3>
                <p>${CONFIG.WELCOME_MESSAGE}</p>
                <p style="margin-top: 8px;"><strong>Try asking:</strong> "TDS payment process" or "How to create an e-invoice?"</p>
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
        const SUITELET_URL = '${CONFIG.SUITELET_URL}';
        let currentSearchResults = null;
        let currentQuery = null;

        // Initialize
        document.getElementById('searchInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                performSearch();
            }
        });

        // Focus input on load
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

            // Show loading state
            showLoading();

            // Disable button
            const btn = document.getElementById('searchButton');
            btn.disabled = true;
            btn.textContent = 'Searching...';

            // Make request to Suitelet
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
                // Re-display previous search results
                const html = formatSearchResults(currentSearchResults, currentQuery);
                displaySearchResults(html);
            } else {
                // Clear chat area
                location.reload();
            }
        }

        function displaySearchResults(html) {
            const chatArea = document.getElementById('chatArea');
            chatArea.innerHTML = html;
            chatArea.scrollTop = 0;
        }

        function displayArticle(html) {
            const chatArea = document.getElementById('chatArea');
            chatArea.innerHTML = html;
            chatArea.scrollTop = 0;
        }

        function showLoading() {
            const chatArea = document.getElementById('chatArea');
            chatArea.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Searching knowledge base...</p></div>';
        }

        function showError(message) {
            const chatArea = document.getElementById('chatArea');
            chatArea.innerHTML = '<div class="no-results"><p>⚠️ ' + escapeHtml(message) + '</p><p class="hint">Please try again or contact support.</p></div>';
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function formatSearchResults(results, query) {
            if (!results || results.length === 0) {
                return '<div class="no-results"><p>No articles found for: <strong>' + escapeHtml(query) + '</strong></p><p class="hint">Try different keywords or ask a question instead.</p></div>';
            }

            let html = '<div class="search-results">';
            html += '<div class="results-header">';
            html += '<p>Found ' + results.length + ' relevant article' + (results.length > 1 ? 's' : '') + ' for: <strong>' + escapeHtml(query) + '</strong></p>';
            html += '</div>';

            results.forEach(function(article, index) {
                html += '<div class="result-item" onclick="loadArticle(\\'' + article.file_id + '\\', \\'' + escapeHtml(article.title) + '\\')">';
                html += '<div class="result-number">' + (index + 1) + '</div>';
                html += '<div class="result-content">';
                html += '<h3 class="result-title">' + article.title + '</h3>';
                html += '<p class="result-summary">' + article.summary + '</p>';
                html += '<div class="result-keywords">';
                article.keywords.slice(0, 5).forEach(function(keyword) {
                    html += '<span class="keyword-tag">' + keyword + '</span>';
                });
                html += '</div></div>';
                html += '<div class="result-arrow">→</div>';
                html += '</div>';
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
     * Helper: Escape HTML special characters
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

            // Handle AJAX requests
            if (action === 'search') {
                const query = context.request.parameters.query;

                if (!query) {
                    context.response.write(JSON.stringify({
                        success: false,
                        error: 'No query provided'
                    }));
                    return;
                }

                log.audit({
                    title: 'Search Request',
                    details: 'Query: ' + query
                });

                // Load articles index
                const articles = loadArticlesIndex();

                if (!articles || articles.length === 0) {
                    context.response.write(JSON.stringify({
                        success: false,
                        error: 'Knowledge base not available'
                    }));
                    return;
                }

                // Detect intent
                const intent = detectIntent(query);

                // Rank articles
                const rankedArticles = rankArticles(query, articles);

                // Format results
                const html = formatSearchResults(rankedArticles, query);

                context.response.write(JSON.stringify({
                    success: true,
                    html: html,
                    results: rankedArticles,
                    intent: intent
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

                log.audit({
                    title: 'Load Article',
                    details: 'File ID: ' + fileId + ', Title: ' + title
                });

                // Load article content
                const content = loadArticleContent(fileId);

                // Format article with dynamic URLs
                const html = formatArticleContent(content, title || 'Article');

                context.response.write(JSON.stringify({
                    success: true,
                    html: html
                }));

            } else {
                // Initial page load - show UI
                context.response.write(buildUI());
            }

        } catch (e) {
            log.error({
                title: 'Suitelet Error',
                details: e.toString() + '\n' + e.stack
            });

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
