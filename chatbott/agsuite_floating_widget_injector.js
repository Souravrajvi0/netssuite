/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 * 
 * AGSuite Tech Assistant - Sidebar Widget Injector
 * Injects the floating sidebar widget on NetSuite pages
 */

define(['N/ui/serverWidget', 'N/log'], function(serverWidget, log) {

    /**
     * Before Load - Injects the client script into the page
     */
    function beforeLoad(context) {
        try {
            log.debug('AGSuite Injector', 'beforeLoad triggered');
            
            var form = context.form;
            
            // Use file path to the sidebar client script
            // Update this path to match where you uploaded the file
            form.clientScriptModulePath = './agsuite_sidebar_widget_client.js';            
            log.debug('AGSuite Injector', 'Client script injected successfully');
            
        } catch (e) {
            log.error('AGSuite Widget Injection Error', e.toString());
        }
    }

    return {
        beforeLoad: beforeLoad
    };
});