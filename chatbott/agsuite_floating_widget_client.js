/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 * 
 * AGSuite Tech Assistant - Sidebar Widget with Debug Logging
 */

define(['N/url'], function(url) {
    console.log('===== AGSuite: Client script loaded =====');
    // Self-execute immediately
    (function() {
        console.log('AGSuite: Self-executing function triggered');
        
        try {
            if (document.getElementById('agsuite-sidebar-widget')) {
                console.log('AGSuite: Widget already exists, skipping');
                return;
            }
            
            console.log('AGSuite: Creating sidebar widget...');
            createSidebarWidget();
            console.log('AGSuite: Widget creation complete!');
            
        } catch (e) {
            console.error('AGSuite: Initialization error:', e);
        }
    })();
    
    function pageInit(context) {
        console.log('AGSuite: pageInit triggered (backup)');
    }

    function createSidebarWidget() {
        console.log('AGSuite: Starting createSidebarWidget()');
        
        // Step 1: Get Suitelet URL
        var suiteletUrl;
        try {
            console.log('AGSuite: Resolving Suitelet URL...');
            suiteletUrl = url.resolveScript({
                scriptId: 'customscript722',
                deploymentId: 'customdeploy1',
                returnExternalUrl: false
            });
            console.log('AGSuite: ✅ Suitelet URL:', suiteletUrl);
        } catch (e) {
            console.error('AGSuite: ❌ Error resolving Suitelet URL:', e);
            alert('AGSuite Error: Could not find Suitelet. Check Script ID and Deployment ID.');
            return;
        }

        // Step 2: Create CSS
        console.log('AGSuite: Creating CSS styles...');
        var styles = document.createElement('style');
        styles.innerHTML = `
            /* Floating Button - NetSuite Style */
            #agsuite-float-btn {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 56px;
                height: 56px;
                background: #2b5672;
                border-radius: 50%;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                cursor: pointer;
                z-index: 9997;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
                border: 3px solid white;
            }
            
            #agsuite-float-btn:hover {
                transform: scale(1.1);
                box-shadow: 0 6px 16px rgba(0,0,0,0.3);
                background: #1f4159;
            }
            
            #agsuite-float-btn img {
                width: 32px;
                height: 32px;
                border-radius: 50%;
            }
            
            /* Sidebar Container */
            #agsuite-sidebar {
                position: fixed;
                top: 0;
                right: -450px;
                width: 450px;
                height: 100%;
                background: white;
                box-shadow: -4px 0 12px rgba(0,0,0,0.2);
                z-index: 9998;
                transition: right 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                display: flex;
                flex-direction: column;
            }
            
            #agsuite-sidebar.open {
                right: 0;
            }
            
            /* Sidebar Header */
            #agsuite-sidebar-header {
                background: #2b5672;
                color: white;
                padding: 16px 20px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            
            #agsuite-sidebar-title {
                display: flex;
                align-items: center;
                gap: 12px;
                font-size: 16px;
                font-weight: 500;
            }
            
            #agsuite-sidebar-title img {
                width: 28px;
                height: 28px;
                border-radius: 50%;
            }
            
            /* Close Button */
            #agsuite-close-btn {
                background: transparent;
                border: none;
                color: white;
                font-size: 28px;
                cursor: pointer;
                padding: 0;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                transition: background 0.2s;
            }
            
            #agsuite-close-btn:hover {
                background: rgba(255,255,255,0.1);
            }
            
            /* Sidebar Content */
            #agsuite-sidebar-content {
                flex: 1;
                overflow: hidden;
            }
            
            #agsuite-iframe {
                width: 100%;
                height: 100%;
                border: none;
            }
            
            /* Backdrop */
            #agsuite-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.3);
                z-index: 9996;
                display: none;
                transition: opacity 0.3s ease;
            }
            
            #agsuite-backdrop.visible {
                display: block;
            }
            
            /* Mobile Responsive */
            @media (max-width: 768px) {
                #agsuite-sidebar {
                    width: 100%;
                    right: -100%;
                }
            }
        `;
        document.head.appendChild(styles);
        console.log('AGSuite: ✅ CSS styles added');

        // Step 3: Create floating button
        console.log('AGSuite: Creating floating button...');
        var floatBtn = document.createElement('button');
        floatBtn.id = 'agsuite-float-btn';
        floatBtn.title = 'Open AGSuite Assistant';
        floatBtn.innerHTML = '<img src="https://td2913181.app.netsuite.com/core/media/media.nl?id=1844&c=TD2913181&h=E9Ak7VWyhX2d81pAogdlhcD9huhCalDrzTAuOJvw1wolW0ab" alt="AGSuite" />';
        floatBtn.onclick = function() {
            console.log('AGSuite: Button clicked!');
            openSidebar();
        };
        document.body.appendChild(floatBtn);
        console.log('AGSuite: ✅ Floating button added to page');

        // Step 4: Create backdrop
        console.log('AGSuite: Creating backdrop...');
        var backdrop = document.createElement('div');
        backdrop.id = 'agsuite-backdrop';
        backdrop.onclick = closeSidebar;
        document.body.appendChild(backdrop);
        console.log('AGSuite: ✅ Backdrop added');

        // Step 5: Create sidebar
        console.log('AGSuite: Creating sidebar...');
        var sidebar = document.createElement('div');
        sidebar.id = 'agsuite-sidebar';
        
        // Create header
        var header = document.createElement('div');
        header.id = 'agsuite-sidebar-header';
        
        var title = document.createElement('div');
        title.id = 'agsuite-sidebar-title';
        title.innerHTML = '<img src="https://td2913181.app.netsuite.com/core/media/media.nl?id=1844&c=TD2913181&h=E9Ak7VWyhX2d81pAogdlhcD9huhCalDrzTAuOJvw1wolW0ab" alt="AGSuite" /><span>AGSuite Tech Assistant</span>';
        
        var closeBtn = document.createElement('button');
        closeBtn.id = 'agsuite-close-btn';
        closeBtn.innerHTML = '×';
        closeBtn.title = 'Close';
        closeBtn.onclick = closeSidebar;
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        
        // Create content area
        var content = document.createElement('div');
        content.id = 'agsuite-sidebar-content';
        
        var iframe = document.createElement('iframe');
        iframe.id = 'agsuite-iframe';
        iframe.src = suiteletUrl;
        console.log('AGSuite: iframe src set to:', suiteletUrl);
        
        content.appendChild(iframe);
        
        // Assemble
        sidebar.appendChild(header);
        sidebar.appendChild(content);
        document.body.appendChild(sidebar);
        console.log('AGSuite: ✅ Sidebar added to page');
        
        // Step 6: Add ESC key handler
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                console.log('AGSuite: ESC key pressed');
                closeSidebar();
            }
        });
        console.log('AGSuite: ✅ ESC key handler added');
        
        console.log('===== AGSuite: All components created successfully! =====');
    }

    function openSidebar() {
        console.log('AGSuite: openSidebar() called');
        var sidebar = document.getElementById('agsuite-sidebar');
        var backdrop = document.getElementById('agsuite-backdrop');
        var floatBtn = document.getElementById('agsuite-float-btn');
        
        console.log('AGSuite: Elements found:', {
            sidebar: !!sidebar,
            backdrop: !!backdrop,
            floatBtn: !!floatBtn
        });
        
        if (sidebar && backdrop && floatBtn) {
            sidebar.classList.add('open');
            backdrop.classList.add('visible');
            floatBtn.style.display = 'none';
            console.log('AGSuite: ✅ Sidebar opened');
        } else {
            console.error('AGSuite: ❌ Could not open sidebar - missing elements');
        }
    }

    function closeSidebar() {
        console.log('AGSuite: closeSidebar() called');
        var sidebar = document.getElementById('agsuite-sidebar');
        var backdrop = document.getElementById('agsuite-backdrop');
        var floatBtn = document.getElementById('agsuite-float-btn');
        
        if (sidebar && backdrop && floatBtn) {
            sidebar.classList.remove('open');
            backdrop.classList.remove('visible');
            floatBtn.style.display = 'flex';
            console.log('AGSuite: ✅ Sidebar closed');
        }
    }

    return {
        pageInit: pageInit
    };
});