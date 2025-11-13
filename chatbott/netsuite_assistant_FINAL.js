/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * 
 * Universal NetSuite Assistant Framework with Knowledge Base Search
 * FINAL VERSION WITH INTEGRATED SEARCH
 * 
 * Version: 2.0 - Knowledge Base Integration
 */

define(['N/ui/serverWidget', 'N/llm', 'N/log', 'N/search', 'N/runtime', 'N/cache', 'N/file'], 
    (serverWidget, llm, log, search, runtime, cache, file) => {

    // ========================================
    // KNOWLEDGE BASE CONFIGURATION
    // ========================================
    
    const KNOWLEDGE_BASE = {
        // TODO: Replace with your actual Internal ID after uploading articles_index_with_internal_ids.json
        INDEX_FILE_ID: '3139',
        enabled: true,
        cache_ttl: 3600 // Cache index for 1 hour
    };

    // ========================================
    // MODULE REGISTRY
    // ========================================
    
    const MODULES = {
        tds: {
            id: 'tds',
            name: 'TDS Master',
            description: 'Manage TDS records, sections, and rates',
            keywords: ['tds', 'tax deduction', 'section 194', 'withholding'],
            actions: ['create', 'view'],
            enabled: true
        },
        agtax: {
            id: 'agtax',
            name: 'AG Tax Matrix',
            description: 'Manage GST tax codes and rates',
            keywords: ['ag tax', 'gst', 'cgst', 'sgst', 'igst', 'tax code'],
            actions: ['create', 'view'],
            enabled: true
        }
    };

    // ========================================
    // CONFIGURATION
    // ========================================
    
    const CONFIG = {
        tds: {
            createUrl: 'https://td2913181.app.netsuite.com/app/common/custom/custrecordentry.nl?rectype=1042',
            editUrlBase: 'https://td2913181.app.netsuite.com/app/common/custom/custrecordentry.nl?rectype=1042&id=',
            recordType: 'customrecord_agtax_tdsmaster'
        },
        agtax: {
            createUrl: 'https://td2913181.app.netsuite.com/app/common/custom/custrecordentry.nl?rectype=1028',
            editUrlBase: 'https://td2913181.app.netsuite.com/app/common/custom/custrecordentry.nl?rectype=1028&id=',
            recordType: 'customrecord_agtax_code_matrix'
        }
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
            const indexFile = file.load({ id: KNOWLEDGE_BASE.INDEX_FILE_ID });
            const indexContent = indexFile.getContents();
            const articlesIndex = JSON.parse(indexContent);
            
            // Store in cache
            knowledgeCache.put({
                key: 'articles_index',
                value: indexContent,
                ttl: KNOWLEDGE_BASE.cache_ttl
            });
            
            log.debug('Knowledge Base', 'Loaded ' + articlesIndex.length + ' articles from file');
            return articlesIndex;
            
        } catch (e) {
            log.error('Knowledge Base Load Error', e.toString());
            return null;
        }
    }

    /**
     * Load a specific article content by Internal ID
     */
    function loadArticleContent(internalId) {
        try {
            const articleFile = file.load({ id: internalId });
            return articleFile.getContents();
        } catch (e) {
            log.error('Article Load Error', 'ID: ' + internalId + ', Error: ' + e.toString());
            return null;
        }
    }

    /**
     * Use LLM to rank articles by relevance to user query
     */
    function rankArticlesByRelevance(userQuery, articlesIndex) {
        try {
            // Create a simplified version for LLM (title, summary, keywords only)
            const simplifiedArticles = articlesIndex.map(article => ({
                id: article.id,
                internal_id: article.internal_id,
                title: article.title,
                summary: article.summary,
                keywords: article.keywords.join(', '),
                category: article.category
            }));
            
            const rankingPrompt = 
                'You are a search ranking expert for AGTAX documentation.\n\n' +
                'User Query: "' + userQuery + '"\n\n' +
                'Available Articles:\n' +
                JSON.stringify(simplifiedArticles, null, 2) + '\n\n' +
                'Task: Rank these articles by relevance to the user query.\n\n' +
                'Respond with ONLY valid JSON array of article IDs in order from most to least relevant.\n' +
                'Include only the top 7 most relevant articles.\n' +
                'Format: ["01", "05", "16", "13", "09", "22", "25"]\n\n' +
                'Consider:\n' +
                '- Keyword matches\n' +
                '- Title relevance\n' +
                '- Summary content\n' +
                '- Category relevance\n\n' +
                'Return ONLY the JSON array, no other text.';
            
            const result = llm.generateText({
                prompt: rankingPrompt,
                modelParameters: { maxTokens: 200, temperature: 0.3 }
            });
            
            // Parse LLM response
            let jsonText = result.text.trim()
                .replace(/```json\n?/g, '').replace(/```\n?/g, '')
                .replace(/^[^\[]*(\[.*\])[^\]]*$/s, '$1');
            
            const rankedIds = JSON.parse(jsonText);
            
            // Map IDs back to full article objects
            const rankedArticles = [];
            rankedIds.forEach(id => {
                const article = articlesIndex.find(a => a.id === id);
                if (article) rankedArticles.push(article);
            });
            
            log.debug('Article Ranking', 'Query: ' + userQuery + ', Found: ' + rankedArticles.length + ' articles');
            return rankedArticles;
            
        } catch (e) {
            log.error('Article Ranking Error', e.toString());
            // Fallback: simple keyword matching
            return simpleKeywordSearch(userQuery, articlesIndex);
        }
    }

    /**
     * Fallback: Simple keyword-based search
     */
    function simpleKeywordSearch(query, articlesIndex) {
        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(/\s+/);
        
        const scored = articlesIndex.map(article => {
            let score = 0;
            const titleLower = article.title.toLowerCase();
            const summaryLower = article.summary.toLowerCase();
            const keywordsLower = article.keywords.join(' ').toLowerCase();
            
            // Score based on matches
            queryWords.forEach(word => {
                if (titleLower.includes(word)) score += 10;
                if (keywordsLower.includes(word)) score += 5;
                if (summaryLower.includes(word)) score += 2;
            });
            
            return { article: article, score: score };
        });
        
        // Sort by score and return top 7
        scored.sort((a, b) => b.score - a.score);
        return scored.filter(s => s.score > 0).slice(0, 7).map(s => s.article);
    }

    /**
     * Detect if user input is a search query or question
     */
    function detectQueryType(userInput) {
        try {
            const detectionPrompt = 
                'Analyze this user input and determine if they want to SEARCH documentation or ASK a question.\n\n' +
                'User Input: "' + userInput + '"\n\n' +
                'Rules:\n' +
                '- SEARCH: Keywords, topics, "show me", "find", "about", "how to setup", navigation requests\n' +
                '- QUESTION: "What is", "How does", "Why", "Can you explain", direct questions\n\n' +
                'Respond with ONLY valid JSON:\n' +
                '{"type": "search" or "question", "confidence": 0.0 to 1.0}\n\n' +
                'Examples:\n' +
                '"TDS payment" -> {"type": "search", "confidence": 0.9}\n' +
                '"What is TDS?" -> {"type": "question", "confidence": 0.95}\n' +
                '"How to create invoice" -> {"type": "search", "confidence": 0.85}\n\n' +
                'Return ONLY the JSON, no other text.';
            
            const result = llm.generateText({
                prompt: detectionPrompt,
                modelParameters: { maxTokens: 100, temperature: 0.2 }
            });
            
            let jsonText = result.text.trim()
                .replace(/```json\n?/g, '').replace(/```\n?/g, '')
                .replace(/^[^{]*({.*})[^}]*$/s, '$1');
            
            const detection = JSON.parse(jsonText);
            return detection;
            
        } catch (e) {
            log.error('Query Type Detection Error', e.toString());
            // Default to question for safety
            return { type: 'question', confidence: 0.5 };
        }
    }

    /**
     * Format search results for display
     */
    function formatArticleResults(articles) {
        if (!articles || articles.length === 0) {
            return '<div class="info-box">' +
                   'No articles found for your query. Try different keywords or ask a question instead.' +
                   '</div>';
        }
        
        let html = '<div class="info-box">';
        html += 'Found ' + articles.length + ' relevant article' + (articles.length > 1 ? 's' : '') + ':';
        html += '</div><br>';
        
        articles.forEach((article, idx) => {
            html += '<div class="article-result" onclick="viewArticle(\'' + article.internal_id + '\', \'' + article.id + '\')">';
            html += '<div class="article-number">' + (idx + 1) + '</div>';
            html += '<div class="article-content">';
            html += '<div class="article-title">' + article.title + '</div>';
            html += '<div class="article-summary">' + article.summary.substring(0, 150) + '...</div>';
            html += '<div class="article-meta">';
            html += '<span class="category-badge">' + article.category + '</span>';
            html += '<span class="view-link">Click to view full article →</span>';
            html += '</div>';
            html += '</div>';
            html += '</div>';
        });
        
        return html;
    }

    /**
     * Format full article content for display
     */
    function formatArticleContent(articleContent, articleTitle) {
        let html = '<div class="article-view">';
        html += '<div class="article-header">';
        html += '<button class="back-button" onclick="goBackToSearch()">← Back to Search Results</button>';
        html += '<h2>' + articleTitle + '</h2>';
        html += '</div>';
        html += '<div class="article-body">';
        
        // Convert article content to HTML (simple formatting)
        const lines = articleContent.split('\n');
        lines.forEach(line => {
            line = line.trim();
            if (line === '') {
                html += '<br>';
            } else if (line.toUpperCase() === line && line.length > 10 && !line.includes(':')) {
                // All caps = heading
                html += '<h3>' + line + '</h3>';
            } else if (line.match(/^[-•]\s/)) {
                // Bullet point
                html += '<li>' + line.substring(2) + '</li>';
            } else if (line.match(/^\d+\.\s/)) {
                // Numbered list
                html += '<li>' + line.substring(line.indexOf('.') + 2) + '</li>';
            } else {
                html += '<p>' + line + '</p>';
            }
        });
        
        html += '</div>';
        html += '<div class="article-footer">';
        html += '<button class="back-button" onclick="goBackToSearch()">← Back to Search Results</button>';
        html += '</div>';
        html += '</div>';
        
        return html;
    }

    // ========================================
    // STATE MANAGEMENT
    // ========================================
    
    function getConversationState(userId) {
        try {
            const conversationCache = cache.getCache({
                name: 'NETSUITE_ASSISTANT',
                scope: cache.Scope.PRIVATE
            });
            const stateJson = conversationCache.get({ key: 'user_' + userId });
            if (stateJson) return JSON.parse(stateJson);
        } catch (e) {
            log.debug('Cache Read', 'No state found');
        }
        return {
            stage: 'GREETING',
            currentModule: null,
            currentAction: null,
            conversationHistory: [],
            context: {},
            lastSearchResults: null // Store search results for navigation
        };
    }

    function saveConversationState(userId, state) {
        try {
            const conversationCache = cache.getCache({
                name: 'NETSUITE_ASSISTANT',
                scope: cache.Scope.PRIVATE
            });
            conversationCache.put({
                key: 'user_' + userId,
                value: JSON.stringify(state),
                ttl: 3600
            });
        } catch (e) {
            log.error('Cache Write Error', e);
        }
    }

    function addToHistory(state, role, message) {
        state.conversationHistory.push({
            role: role,
            message: message,
            timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        });
        if (state.conversationHistory.length > 30) {
            state.conversationHistory = state.conversationHistory.slice(-30);
        }
    }

    function getCurrentUserInfo() {
        try {
            const user = runtime.getCurrentUser();
            return {
                id: user.id,
                name: user.name,
                firstName: user.name.split(' ')[0],
                isLoggedIn: user.role !== -4
            };
        } catch (e) {
            return { isLoggedIn: false, id: 'guest', firstName: 'Guest' };
        }
    }

    // ========================================
    // AI INTELLIGENCE ENGINE (Enhanced)
    // ========================================
    
    function classifyIntent(userInput) {
        try {
            // Question detection - highest priority
            const questionPatterns = [
                /^(what|how|why|when|where|who|can you|tell me|explain|describe)/i,
                /(what is|what are|how do|how does|tell me about)/i
            ];
            
            const isExplicitQuestion = questionPatterns.some(pattern => pattern.test(userInput.trim()));
            
            if (isExplicitQuestion) {
                log.debug('Intent', 'Explicit question detected');
                return { module: 'general', action: 'question', confidence: 0.95 };
            }

            const moduleList = Object.values(MODULES)
                .filter(m => m.enabled)
                .map(m => m.id + ' (' + m.keywords.join(', ') + ')')
                .join(', ');

            const classificationPrompt = 
                'Classify this NetSuite request:\n\n' +
                'User input: "' + userInput + '"\n\n' +
                'Available modules: ' + moduleList + '\n\n' +
                'Respond with ONLY valid JSON:\n' +
                '{"module": "tds" or "agtax" or "general", "action": "create" or "search" or "question", "confidence": 0.0 to 1.0}\n\n' +
                'Rules:\n' +
                '- If wants to create/add/new then action: "create"\n' +
                '- If wants to find/search/show/list then action: "search"\n' +
                '- Match keywords to modules\n' +
                '- If unsure then module: "general", action: "question"\n\n' +
                'Respond with ONLY the JSON, no other text.';

            const result = llm.generateText({
                prompt: classificationPrompt,
                modelParameters: { maxTokens: 150, temperature: 0.1 }
            });

            let jsonText = result.text.trim()
                .replace(/```json\n?/g, '').replace(/```\n?/g, '')
                .replace(/^[^{]*({.*})[^}]*$/s, '$1');
            
            const intent = JSON.parse(jsonText);
            
            log.debug('Intent Classified', JSON.stringify(intent));
            
            return {
                module: intent.module || 'general',
                action: intent.action || 'question',
                confidence: intent.confidence || 0.5
            };
        } catch (e) {
            log.error('Intent Classification Error', e);
            return { module: 'general', action: 'question', confidence: 0.0 };
        }
    }

    function generateAIResponse(userInput, context) {
        try {
            const systemPrompt = 
                'You are AGSuite Tech Assistant, a helpful NetSuite assistant for AGTAX taxation functionality. Answer questions clearly and concisely.\n\n' +
                'Topics you can help with:\n' +
                '- TDS sections: 194J (professional fees), 194C (contracts), 194H (commission), etc.\n' +
                '- GST/AG Tax: IGST for inter-state, SGST plus CGST for intra-state\n' +
                '- Sales Orders, Purchase Orders, Invoices\n' +
                '- NetSuite records and navigation\n' +
                '- AGTAX documentation and setup guides\n\n' +
                'Keep answers under 60 words and be helpful. If the question is about AGTAX setup or processes, suggest they can search the documentation.';

            const result = llm.generateText({
                prompt: systemPrompt + '\n\nUser question: ' + userInput,
                modelParameters: { maxTokens: 200, temperature: 0.7 }
            });

            let response = result.text.trim();
            
            // Basic cleanup
            if (response.length > 400) {
                response = response.substring(0, 400) + '...';
            }
            
            return response;
        } catch (e) {
            log.error('AI Response Error', e.toString());
            
            // Smart fallback based on question keywords
            const input = userInput.toLowerCase();
            
            if (input.includes('sales order') || input.includes('so')) {
                return 'Sales Orders in NetSuite track customer purchases. You can create them from customers or opportunities, add items, and convert to invoices once fulfilled.';
            } else if (input.includes('gst') || input.includes('tax code')) {
                return 'GST tax codes in NetSuite: IGST applies for inter-state transactions, while SGST plus CGST applies for intra-state. Rate depends on product/service category.';
            } else if (input.includes('194')) {
                return 'TDS Section 194J covers professional or technical fees. Rate is typically 10 percent. Used for payments to consultants, professionals, and technical service providers.';
            } else {
                return 'I can help with TDS sections, GST tax codes, and NetSuite records. You can also search the AGTAX documentation for detailed guides.';
            }
        }
    }

    // ========================================
    // SMART BUTTON GENERATION
    // ========================================
    
    function generateSmartButtons(stage, module, userInfo) {
        let buttons = [];

        if (stage === 'GREETING' || stage === 'MAIN_MENU') {
            Object.values(MODULES).filter(m => m.enabled).forEach(m => {
                buttons.push({
                    label: m.name,
                    value: 'module:' + m.id,
                    description: m.description
                });
            });
            
            buttons.push({
                label: 'Ask a Question',
                value: 'action:question',
                description: 'Get help or information'
            });
        }
        else if (stage === 'MODULE_SELECTED' && module) {
            const moduleConfig = MODULES[module];
            if (moduleConfig) {
                buttons.push({
                    label: 'Create New',
                    value: 'action:create',
                    description: 'Create new ' + moduleConfig.name
                });
                buttons.push({
                    label: 'View All',
                    value: 'action:viewall',
                    description: 'View all records'
                });
                
                buttons.push({
                    label: 'Back to Menu',
                    value: 'navigation:menu',
                    description: 'Return to main menu'
                });
            }
        }
        else if (stage === 'SEARCH_INPUT') {
            buttons.push({
                label: 'Show All',
                value: 'search:all',
                description: 'Display all active records'
            });
            buttons.push({
                label: 'Back',
                value: 'navigation:back',
                description: 'Go back'
            });
        }

        return buttons;
    }

    function renderButtons(buttons) {
        if (!buttons || buttons.length === 0) return '';
        
        let html = '<div class="button-group">';
        buttons.forEach(btn => {
            html += '<button class="option-button" onclick="selectOption(\'' + btn.value + '\')" title="' + (btn.description || '') + '">';
            html += btn.label;
            html += '</button>';
        });
        html += '</div>';
        return html;
    }

    // ========================================
    // GREETING GENERATOR
    // ========================================
    
    function generateGreeting(userInfo) {
        const greeting = userInfo.isLoggedIn ?
            'Hi ' + userInfo.firstName + ', I am your AGSuite Tech Assistant!' :
            'Hi there! I am your AGSuite Tech Assistant.';
        
        const enabledModules = Object.values(MODULES).filter(m => m.enabled);
        
        let message = greeting + ' I can help you with:<br><br>';
        
        enabledModules.forEach(m => {
            message += '<strong>' + m.name + ':</strong> ' + m.description + '<br>';
        });
        
        message += '<br>You can either:<br>';
        message += '- Type naturally what you need<br>';
        message += '- Use the buttons below for guided navigation<br><br>';
        message += 'What would you like to do?';
        
        const buttons = generateSmartButtons('GREETING', null, userInfo);
        message += '<br>' + renderButtons(buttons);
        
        return message;
    }

    // ========================================
    // MODULE HANDLERS (TDS & AG TAX - UNCHANGED)
    // ========================================
    
    const TDSHandler = {
        search: function(criteria) {
            try {
                const filters = [];
                
                if (criteria.name) filters.push(['name', 'contains', criteria.name]);
                if (criteria.section) {
                    if (filters.length > 0) filters.push('AND');
                    filters.push(['custrecord_master_section', 'anyof', criteria.section]);
                }
                if (criteria.id) {
                    if (filters.length > 0) filters.push('AND');
                    filters.push(['internalid', 'anyof', criteria.id]);
                }
                if (filters.length === 0) filters.push(['isinactive', 'is', 'F']);

                const tdsSearch = search.create({
                    type: CONFIG.tds.recordType,
                    filters: filters,
                    columns: ['internalid', 'name', 'custrecord_master_section', 'custrecord_tds_master_rate']
                });

                const results = tdsSearch.run().getRange({start: 0, end: 50});
                
                if (results.length > 0) {
                    return results.map(result => ({
                        id: result.getValue('internalid'),
                        name: result.getValue('name'),
                        section: result.getText('custrecord_master_section'),
                        rate: result.getValue('custrecord_tds_master_rate')
                    }));
                }
                return null;
            } catch (e) {
                log.error('TDS Search Error', e);
                return null;
            }
        },
        
        extractCriteria: function(input) {
            const criteria = {};
            if (input.toLowerCase().includes('show all') || input.toLowerCase() === 'all') return {};
            
            const idMatch = input.match(/\b(id|#)\s*(\d+)/i);
            if (idMatch) criteria.id = idMatch[2];
            
            const sectionMatch = input.match(/194[a-z]{0,2}/i);
            if (sectionMatch) criteria.section = sectionMatch[0].toUpperCase();
            
            if (!criteria.id && !criteria.section && input.length > 2) {
                criteria.name = input;
            }
            
            return criteria;
        }
    };

    const AGTaxHandler = {
        search: function(criteria) {
            try {
                const filters = [];
                
                if (criteria.name) filters.push(['name', 'contains', criteria.name]);
                if (criteria.gstType) {
                    if (filters.length > 0) filters.push('AND');
                    filters.push(['custrecord_agtax_gst_type', 'anyof', criteria.gstType]);
                }
                if (criteria.id) {
                    if (filters.length > 0) filters.push('AND');
                    filters.push(['internalid', 'anyof', criteria.id]);
                }
                if (filters.length === 0) filters.push(['isinactive', 'is', 'F']);

                const agTaxSearch = search.create({
                    type: CONFIG.agtax.recordType,
                    filters: filters,
                    columns: ['internalid', 'custrecord_agtax_gst_type', 'custrecord_agtax_sac_hsn_taxrate']
                });

                const results = agTaxSearch.run().getRange({start: 0, end: 50});
                
                if (results.length > 0) {
                    return results.map(result => ({
                        id: result.getValue('internalid'),
                        gstType: result.getText('custrecord_agtax_gst_type'),
                        taxRate: result.getValue('custrecord_agtax_sac_hsn_taxrate')
                    }));
                }
                return null;
            } catch (e) {
                log.error('AG Tax Search Error', e);
                return null;
            }
        },
        
        extractCriteria: function(input) {
            const criteria = {};
            if (input.toLowerCase().includes('show all') || input.toLowerCase() === 'all') return {};
            
            const idMatch = input.match(/\b(id|#)\s*(\d+)/i);
            if (idMatch) criteria.id = idMatch[2];
            
            if (input.toLowerCase().includes('igst')) criteria.gstType = 'IGST';
            else if (input.toLowerCase().includes('inter')) criteria.gstType = 'Inter-State';
            else if (input.toLowerCase().includes('intra')) criteria.gstType = 'Intra-State';
            
            if (!criteria.id && !criteria.gstType && input.length > 2) {
                criteria.name = input;
            }
            
            return criteria;
        }
    };

    const MODULE_HANDLERS = {
        tds: TDSHandler,
        agtax: AGTaxHandler
    };

    // ========================================
    // RESULT FORMATTING
    // ========================================
    
    function formatSearchResults(results, module) {
        if (!results || results.length === 0) {
            return '<div class="warning-box">' +
                   '<strong>No records found</strong><br>' +
                   'Try different search terms or click Show All to see all active records.' +
                   '</div>';
        }
        
        const moduleConfig = MODULES[module];
        const config = CONFIG[module];
        
        let html = '<div class="info-box">';
        html += results.length === 1 ? 
                'Found your record:' : 
                'Found ' + results.length + ' records' + (results.length > 5 ? ' (showing first 5):' : ':');
        html += '</div><br>';
        
        results.slice(0, 5).forEach((record, idx) => {
            html += '<div class="result-item">';
            html += '<strong>' + (idx + 1) + '.</strong> ';
            html += '<span class="item-name">' + (record.name || 'ID: ' + record.id) + '</span>';
            
            if (record.section) html += ' <span class="badge">' + record.section + '</span>';
            if (record.gstType) html += ' <span class="badge">' + record.gstType + '</span>';
            if (record.rate) html += ' <span class="rate-badge">' + record.rate + '%</span>';
            if (record.taxRate) html += ' <span class="rate-badge">' + record.taxRate + '%</span>';
            
            html += ' <a href="' + config.editUrlBase + record.id + '" target="_blank" class="inline-link">View/Edit</a>';
            html += '</div>';
        });
        
        return html;
    }

    // ========================================
    // MAIN CONVERSATION PROCESSOR (ENHANCED)
    // ========================================
    
    function processConversation(userInput, state, userInfo) {
        addToHistory(state, 'user', userInput);
        
        // Handle article view request
        if (userInput.startsWith('article:view:')) {
            const parts = userInput.split(':');
            const internalId = parts[2];
            const articleId = parts[3];
            
            const articlesIndex = loadArticlesIndex();
            const article = articlesIndex ? articlesIndex.find(a => a.id === articleId) : null;
            
            if (article) {
                const articleContent = loadArticleContent(internalId);
                if (articleContent) {
                    const response = formatArticleContent(articleContent, article.title);
                    addToHistory(state, 'assistant', response);
                    return { message: response, state: state };
                }
            }
            
            const response = '<div class="warning-box">Unable to load article content. Please try again.</div>';
            addToHistory(state, 'assistant', response);
            return { message: response, state: state };
        }
        
        // Handle back to search
        if (userInput === 'navigation:backtosearch' && state.lastSearchResults) {
            const response = formatArticleResults(state.lastSearchResults);
            addToHistory(state, 'assistant', response);
            return { message: response, state: state };
        }
        
        // Handle button clicks
        if (userInput.startsWith('module:')) {
            const moduleId = userInput.split(':')[1];
            state.currentModule = moduleId;
            state.stage = 'MODULE_SELECTED';
            
            const moduleConfig = MODULES[moduleId];
            const response = '<strong>' + moduleConfig.name + '</strong><br><br>' +
                           moduleConfig.description + '<br><br>' +
                           'What would you like to do?<br>' +
                           renderButtons(generateSmartButtons('MODULE_SELECTED', moduleId, userInfo));
            
            addToHistory(state, 'assistant', response);
            return { message: response, state: state };
        }
        
        if (userInput.startsWith('action:')) {
            const action = userInput.split(':')[1];
            
            if (action === 'question') {
                const response = 'Sure! What would you like to know?<br><br>' +
                               '<small>You can ask about TDS sections, GST types, tax rates, or search the AGTAX documentation.</small>';
                state.stage = 'QUESTION_MODE';
                addToHistory(state, 'assistant', response);
                return { message: response, state: state };
            }
            
            if (action === 'create') {
                if (!userInfo.isLoggedIn) {
                    return { 
                        message: '<div class="warning-box">Please log in to NetSuite to create records.</div>', 
                        state: state 
                    };
                }
                
                const config = CONFIG[state.currentModule];
                const moduleConfig = MODULES[state.currentModule];
                const response = '<strong>Create New ' + moduleConfig.name + '</strong><br><br>' +
                               '<a href="' + config.createUrl + '" target="_blank" class="primary-button">Open Creation Form</a><br><br>' +
                               '<div class="tip-box">After creating, come back here to search for it!</div>';
                
                addToHistory(state, 'assistant', response);
                return { message: response, state: state };
            }
            
            if (action === 'viewall') {
                const module = state.currentModule;
                if (!module || !MODULE_HANDLERS[module]) {
                    const response = '<div class="warning-box">Please select a module first.</div>';
                    addToHistory(state, 'assistant', response);
                    return { message: response, state: state };
                }
                
                const handler = MODULE_HANDLERS[module];
                const results = handler.search({});
                const response = formatSearchResults(results, module);
                
                addToHistory(state, 'assistant', response);
                return { message: response, state: state };
            }
        }
        
        if (userInput.startsWith('navigation:')) {
            const nav = userInput.split(':')[1];
            if (nav === 'menu' || nav === 'back') {
                state.stage = 'GREETING';
                state.currentModule = null;
                state.currentAction = null;
                state.lastSearchResults = null;
                const response = generateGreeting(userInfo);
                addToHistory(state, 'assistant', response);
                return { message: response, state: state };
            }
        }
        
        if (userInput.startsWith('search:all')) {
            const module = state.currentModule;
            
            if (!module || !MODULE_HANDLERS[module]) {
                const response = '<div class="warning-box">Please select a module first.</div>';
                addToHistory(state, 'assistant', response);
                return { message: response, state: state };
            }
            
            log.debug('Search All', 'Module: ' + module);
            const handler = MODULE_HANDLERS[module];
            const results = handler.search({});
            const response = formatSearchResults(results, module);
            
            addToHistory(state, 'assistant', response);
            return { message: response, state: state };
        }
        
        // Handle natural language - ENHANCED WITH KNOWLEDGE BASE SEARCH
        if (state.stage === 'GREETING' || state.stage === 'MAIN_MENU') {
            // Check if this is a knowledge base search query
            if (KNOWLEDGE_BASE.enabled) {
                const queryType = detectQueryType(userInput);
                
                if (queryType.type === 'search' && queryType.confidence > 0.6) {
                    // This is a documentation search
                    const articlesIndex = loadArticlesIndex();
                    if (articlesIndex) {
                        const rankedArticles = rankArticlesByRelevance(userInput, articlesIndex);
                        state.lastSearchResults = rankedArticles;
                        const response = formatArticleResults(rankedArticles);
                        addToHistory(state, 'assistant', response);
                        return { message: response, state: state };
                    }
                }
            }
            
            // Otherwise show greeting
            const response = generateGreeting(userInfo);
            state.stage = 'MAIN_MENU';
            addToHistory(state, 'assistant', response);
            return { message: response, state: state };
        }
        
        // AI Intent Detection
        const intent = classifyIntent(userInput);
        log.debug('Natural Language Intent', JSON.stringify(intent));
        
        // Handle questions - NO GREETING AFTER
        if (intent.action === 'question' || state.stage === 'QUESTION_MODE') {
            const answer = generateAIResponse(userInput, state.context);
            const response = '<div class="answer-box">' + answer + '</div>';
            state.stage = 'GREETING';
            state.currentModule = null;
            addToHistory(state, 'assistant', response);
            return { message: response, state: state };
        }
        
        // Handle greetings
        if (intent.module === 'greeting' || intent.action === 'greeting') {
            const response = generateGreeting(userInfo);
            state.stage = 'MAIN_MENU';
            addToHistory(state, 'assistant', response);
            return { message: response, state: state };
        }
        
        // Handle create
        if (intent.action === 'create' && MODULES[intent.module]) {
            if (!userInfo.isLoggedIn) {
                return { 
                    message: '<div class="warning-box">Please log in to NetSuite to create records.</div>', 
                    state: state 
                };
            }
            
            const config = CONFIG[intent.module];
            const moduleConfig = MODULES[intent.module];
            const response = '<strong>Create New ' + moduleConfig.name + '</strong><br><br>' +
                           '<a href="' + config.createUrl + '" target="_blank" class="primary-button">Open Creation Form</a>';
            
            addToHistory(state, 'assistant', response);
            return { message: response, state: state };
        }
        
        // Handle search
        if (intent.action === 'search' && MODULES[intent.module]) {
            state.currentModule = intent.module;
            state.stage = 'SEARCH_INPUT';
            const response = 'What ' + MODULES[intent.module].name + ' would you like to find?<br><br>' +
                           '<small>Type a name, ID, or description. Or click Show All.</small><br>' +
                           renderButtons(generateSmartButtons('SEARCH_INPUT', intent.module, userInfo));
            
            addToHistory(state, 'assistant', response);
            return { message: response, state: state };
        }
        
        // Handle search input
        if (state.stage === 'SEARCH_INPUT' && state.currentModule) {
            const module = state.currentModule;
            const handler = MODULE_HANDLERS[module];
            const criteria = handler.extractCriteria(userInput);
            const results = handler.search(criteria);
            const response = formatSearchResults(results, module);
            
            addToHistory(state, 'assistant', response);
            return { message: response, state: state };
        }
        
        // Fallback
        const response = 'I am not sure what you mean. Try:<br>' +
                        '- Asking a question<br>' +
                        '- Searching the documentation<br>' +
                        '- Requesting an action like create or search<br>' +
                        '- Or use the buttons below:<br><br>' +
                        generateGreeting(userInfo);
        state.stage = 'GREETING';
        state.currentModule = null;
        addToHistory(state, 'assistant', response);
        return { message: response, state: state };
    }

    // ========================================
    // MAIN REQUEST HANDLER
    // ========================================
    
    function onRequest(context) {
        try {
            const userInfo = getCurrentUserInfo();
            let state = getConversationState(userInfo.id);

            if (context.request.method === 'POST') {
                const userInput = context.request.parameters.custpage_userinput;
                
                if (userInput && userInput.trim()) {
                    const result = processConversation(userInput, state, userInfo);
                    state = result.state;
                    saveConversationState(userInfo.id, state);
                }
            } else {
                if (!state.conversationHistory || state.conversationHistory.length === 0) {
                    const greeting = generateGreeting(userInfo);
                    addToHistory(state, 'assistant', greeting);
                    saveConversationState(userInfo.id, state);
                }
            }

            const html = buildUI(userInfo, state);
            context.response.write(html);

        } catch (e) {
            log.error('Suitelet Error', e);
            context.response.write('<h1>Error: ' + e.message + '</h1>');
        }
    }

    // ========================================
    // UI BUILDER (ENHANCED WITH ARTICLE STYLES)
    // ========================================
    
    function buildUI(userInfo, state) {
        let chatHTML = '';
        (state.conversationHistory || []).forEach(msg => {
            const isUser = msg.role === 'user';
            chatHTML += '<div class="message-row ' + (isUser ? 'user' : 'assistant') + '">';
            chatHTML += '<div class="message-bubble">' + msg.message + '</div>';
            chatHTML += '</div>';
        });

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AGSuite Tech Assistant</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f5f5f5;
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .chat-widget {
            width: 100%;
            max-width: 500px;
            height: 700px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .chat-header {
            display: none;
        }
        .chat-body {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            background: #fafafa;
        }
        .notice-box {
            background: #e8edf2;
            padding: 12px;
            border-radius: 6px;
            font-size: 11px;
            line-height: 1.4;
            color: #4a5568;
            margin-bottom: 20px;
        }
        .message-row {
            margin-bottom: 16px;
            display: flex;
            animation: slideIn 0.3s ease;
        }
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .message-row.assistant { justify-content: flex-start; }
        .message-row.user { justify-content: flex-end; }
        .message-bubble {
            max-width: 85%;
            padding: 12px 16px;
            border-radius: 8px;
            font-size: 14px;
            line-height: 1.6;
        }
        .message-row.assistant .message-bubble {
            background: #e8edf2;
            color: #2d3748;
        }
        .message-row.user .message-bubble {
            background: #3f5b7b;
            color: white;
        }
        
        /* Article Search Results Styles */
        .article-result {
            display: flex;
            gap: 12px;
            padding: 12px;
            margin: 8px 0;
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .article-result:hover {
            background: #f7fafc;
            border-color: #3f5b7b;
            transform: translateX(4px);
        }
        .article-number {
            font-weight: bold;
            color: #3f5b7b;
            font-size: 18px;
            min-width: 24px;
        }
        .article-content {
            flex: 1;
        }
        .article-title {
            font-weight: 600;
            color: #2d3748;
            margin-bottom: 4px;
            font-size: 14px;
        }
        .article-summary {
            font-size: 12px;
            color: #718096;
            line-height: 1.4;
            margin-bottom: 6px;
        }
        .article-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .category-badge {
            background: #e8edf2;
            color: #3f5b7b;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
        }
        .view-link {
            color: #3182ce;
            font-size: 11px;
        }
        
        /* Article View Styles */
        .article-view {
            background: white;
            border-radius: 6px;
            padding: 0;
        }
        .article-header {
            padding: 16px;
            border-bottom: 1px solid #e2e8f0;
        }
        .article-header h2 {
            font-size: 18px;
            color: #2d3748;
            margin-top: 12px;
        }
        .back-button {
            background: #e8edf2;
            color: #3f5b7b;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: background 0.2s;
        }
        .back-button:hover {
            background: #cbd5e0;
        }
        .article-body {
            padding: 20px;
            font-size: 13px;
            line-height: 1.7;
            color: #2d3748;
            max-height: 500px;
            overflow-y: auto;
        }
        .article-body h3 {
            font-size: 16px;
            color: #1a202c;
            margin: 20px 0 12px 0;
            font-weight: 600;
        }
        .article-body p {
            margin-bottom: 12px;
        }
        .article-body li {
            margin-left: 20px;
            margin-bottom: 6px;
        }
        .article-footer {
            padding: 16px;
            border-top: 1px solid #e2e8f0;
        }
        
        .button-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-top: 12px;
        }
        .option-button {
            background: white;
            border: 1px solid #cbd5e0;
            padding: 12px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            text-align: left;
            transition: all 0.2s;
            font-family: inherit;
        }
        .option-button:hover {
            background: #f7fafc;
            border-color: #3f5b7b;
            transform: translateX(4px);
        }
        .primary-button {
            display: inline-block;
            background: #48bb78;
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            text-decoration: none;
            font-size: 14px;
            font-weight: 500;
            transition: background 0.2s;
        }
        .primary-button:hover { background: #38a169; }
        .info-box, .warning-box, .answer-box, .tip-box {
            padding: 12px;
            border-radius: 6px;
            margin: 10px 0;
            font-size: 13px;
            line-height: 1.5;
        }
        .info-box {
            background: #ebf8ff;
            border-left: 3px solid #4299e1;
            color: #2c5282;
        }
        .warning-box {
            background: #fffaf0;
            border-left: 3px solid #ed8936;
            color: #7c2d12;
        }
        .answer-box {
            background: #f0fff4;
            border-left: 3px solid #48bb78;
            color: #22543d;
        }
        .tip-box {
            background: #fefcbf;
            border-left: 3px solid #ecc94b;
            color: #744210;
        }
        .result-item {
            padding: 10px;
            border-bottom: 1px solid #e2e8f0;
            font-size: 14px;
        }
        .result-item:last-child { border-bottom: none; }
        .item-name {
            color: #2d3748;
            font-weight: 500;
        }
        .badge {
            display: inline-block;
            background: #e8edf2;
            color: #3f5b7b;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
            margin-left: 6px;
        }
        .rate-badge {
            display: inline-block;
            background: #c6f6d5;
            color: #22543d;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
            margin-left: 6px;
        }
        .inline-link {
            color: #3182ce;
            text-decoration: none;
            font-size: 13px;
            margin-left: 10px;
        }
        .inline-link:hover { text-decoration: underline; }
        .chat-input-area {
            border-top: 1px solid #e2e8f0;
            padding: 16px;
            background: white;
        }
        .input-row {
            display: flex;
            gap: 8px;
        }
        .chat-input {
            flex: 1;
            padding: 10px 14px;
            border: 1px solid #cbd5e0;
            border-radius: 6px;
            font-size: 14px;
            font-family: inherit;
            outline: none;
        }
        .chat-input:focus { border-color: #3f5b7b; }
        .send-button {
            background: #3f5b7b;
            color: white;
            border: none;
            padding: 10px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            font-family: inherit;
            transition: background 0.2s;
        }
        .send-button:hover { background: #2d4a66; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb {
            background: #cbd5e0;
            border-radius: 3px;
        }
        @media (max-width: 768px) {
            .chat-widget {
                height: 100vh;
                max-width: 100%;
                border-radius: 0;
            }
        }
    </style>
</head>
<body>
    <div class="chat-widget">
        <div class="chat-header">
            <img src="https://td2913181.app.netsuite.com/core/media/media.nl?id=1844&c=TD2913181&h=E9Ak7VWyhX2d81pAogdlhcD9huhCalDrzTAuOJvw1wolW0ab" alt="AGSuite Logo" class="logo" />
            <h1>AGSuite Tech Assistant</h1>
        </div>
        
        <div class="chat-body" id="chatBody">
            <div class="notice-box">
                By using this assistant, you agree not to share sensitive personal information. Conversations are logged for 90 days.
            </div>
            ${chatHTML}
        </div>
        
        <div class="chat-input-area">
            <form method="POST" id="chatForm">
                <div class="input-row">
                    <input 
                        type="text" 
                        name="custpage_userinput" 
                        class="chat-input" 
                        placeholder="Type your message or use buttons above..."
                        autocomplete="off"
                        required
                    />
                    <button type="submit" class="send-button">Send</button>
                </div>
            </form>
        </div>
    </div>
    
    <script>
        if (window.self !== window.top) {
            document.body.classList.add('in-sidebar');
        }
        
        document.getElementById('chatBody').scrollTop = 999999;
        document.querySelector('.chat-input').focus();
        
        function selectOption(value) {
            document.querySelector('.chat-input').value = value;
            document.getElementById('chatForm').submit();
        }
        
        function viewArticle(internalId, articleId) {
            document.querySelector('.chat-input').value = 'article:view:' + internalId + ':' + articleId;
            document.getElementById('chatForm').submit();
        }
        
        function goBackToSearch() {
            document.querySelector('.chat-input').value = 'navigation:backtosearch';
            document.getElementById('chatForm').submit();
        }
    </script>
</body>
</html>`;
    }

    return { onRequest: onRequest };
});