# AGSuite AI Knowledge Base Assistant - Deployment Guide

## 🎯 Overview

This chatbot provides AI-powered search over your AGSuite documentation with multi-client support through dynamic URL generation.

### Key Features:
- ✅ LLM-powered article ranking (~2,500 tokens per query)
- ✅ Dynamic URL generation (works across all clients)
- ✅ Placeholder-based articles: `[CREATE:TDS_MASTER]` → working buttons
- ✅ Production-ready error handling
- ✅ Professional responsive UI

---

## 📁 File Structure

```
chatbott/
├── netsuite_assistant_FINAL.js          # Main Suitelet (UPDATED - Dynamic URLs)
├── agsuite_floating_widget_client.js    # Client Script (floating button)
├── agsuite_floating_widget_injector.js  # User Event Script (auto-loader)
└── knowledge_base/
    ├── articles/                         # 25 articles (2 updated with placeholders)
    │   ├── 05_tds_master.txt (UPDATED)
    │   ├── 16_tds_payment.txt (UPDATED)
    │   └── ...23 more articles
    └── articles_index.json               # Index with file_id fields (UPDATED)
```

---

## 🚀 DEPLOYMENT STEPS

### **STEP 1: Upload Articles to File Cabinet**

1. Log into NetSuite
2. Navigate to: **Documents > Files > File Cabinet**
3. Create folder structure:
   ```
   /SuiteScripts/
   └── AGSuite/
       └── knowledge_base/
           └── articles/
   ```
4. Upload all 25 article files to `/SuiteScripts/AGSuite/knowledge_base/articles/`
5. **CRITICAL:** Note the Internal ID of each file:
   - Click on uploaded file
   - Look at URL: `...file.nl?id=XXXX`
   - XXXX is the Internal ID
   - Write down: `01_financial_year_master.txt = 3150` (example)

### **STEP 2: Update articles_index.json**

1. Open `chatbott/knowledge_base/articles_index.json`
2. Replace ALL placeholder file_ids with actual Internal IDs:

   **BEFORE:**
   ```json
   {
     "id": "01",
     "file_id": "REPLACE_WITH_FILE_ID_01",
     "title": "Financial Year Master Setup",
     ...
   }
   ```

   **AFTER:**
   ```json
   {
     "id": "01",
     "file_id": "3150",  // ← Your actual Internal ID
     "title": "Financial Year Master Setup",
     ...
   }
   ```

3. Update all 25 entries
4. Save the file

### **STEP 3: Upload Updated Index**

1. Upload updated `articles_index.json` to:
   `/SuiteScripts/AGSuite/knowledge_base/`
2. Note its Internal ID (e.g., `3139`)

### **STEP 4: Configure Suitelet**

1. Open `netsuite_assistant_FINAL.js`
2. Update Line 21:

   **BEFORE:**
   ```javascript
   INDEX_FILE_ID: '3139', // UPDATE THIS
   ```

   **AFTER:**
   ```javascript
   INDEX_FILE_ID: '3165', // ← Your actual index file ID
   ```

3. **For Each Client:** Update Lines 35-95 (URL_MAPPINGS):

   #### Finding Custom Record Types:
   - Go to: Lists, Records & Fields > Record Types
   - Click on custom record (e.g., "TDS Master")
   - Look at URL: `...custrecordentrylist.nl?rectype=XXXX`
   - XXXX is the rectype

   #### Update URLs:
   **Development Account (td2913181):**
   ```javascript
   TDS_MASTER: {
       recordType: 'customrecord_agtax_tdsmaster',
       createUrl: '/app/common/custom/custrecordentry.nl?rectype=1042',
       listUrl: '/app/common/custom/custrecordentrylist.nl?rectype=1042',
       label: 'TDS Master'
   },
   ```

   **Client A Account:**
   ```javascript
   TDS_MASTER: {
       recordType: 'customrecord_agtax_tdsmaster',
       createUrl: '/app/common/custom/custrecordentry.nl?rectype=9999', // ← Changed
       listUrl: '/app/common/custom/custrecordentrylist.nl?rectype=9999', // ← Changed
       label: 'TDS Master'
   },
   ```

   **Repeat for:**
   - TDS_PAYMENT
   - TDS_CHALLAN
   - TDS_SECTION
   - AGTAX_MATRIX
   - FINANCIAL_YEAR
   - HSN_SAC

   **Note:** Standard NetSuite records (CUSTOMER, VENDOR, INVOICE, etc.) work automatically!

4. Save the file

### **STEP 5: Upload & Deploy Suitelet**

1. Upload `netsuite_assistant_FINAL.js` to: `/SuiteScripts/AGSuite/`
2. Create Script Record:
   - Go to: Customization > Scripting > Scripts > New
   - Select file
   - Click "Create Script Record"
   - Fill in:
     - **Name:** AGSuite Knowledge Assistant
     - **ID:** `_agsuite_assistant_sl`
     - **Function:** `onRequest`
   - Save
3. Create Deployment:
   - Click "Deploy Script"
   - Fill in:
     - **Title:** AGSuite Assistant Production
     - **ID:** `_agsuite_assistant_deploy`
     - **Status:** Testing (initially)
     - **Audience:** All Roles
   - Save
4. Note the Script ID and Deployment ID (for client script)

### **STEP 6: Upload Client Script**

1. Upload `agsuite_floating_widget_client.js` to: `/SuiteScripts/AGSuite/`
2. Open the file and update Lines 42-43:

   **BEFORE:**
   ```javascript
   scriptId: 'customscript722',
   deploymentId: 'customdeploy1',
   ```

   **AFTER:**
   ```javascript
   scriptId: 'customscript_agsuite_assistant_sl',      // ← Your Suitelet Script ID
   deploymentId: 'customdeploy_agsuite_assistant_deploy', // ← Your Deployment ID
   ```

3. Save and re-upload
4. Create Client Script record:
   - Customization > Scripting > Scripts > New
   - Select file
   - Create Script Record
   - Fill in:
     - **Name:** AGSuite Assistant Client
     - **ID:** `_agsuite_assistant_cs`
     - **Page Init Function:** `pageInit`
   - Save (don't deploy - User Event will load it)

### **STEP 7: Upload User Event Script**

1. Upload `agsuite_floating_widget_injector.js` to: `/SuiteScripts/AGSuite/`
2. Create User Event Script record:
   - Customization > Scripting > Scripts > New
   - Select file
   - Create Script Record
   - Fill in:
     - **Name:** AGSuite Assistant Injector
     - **ID:** `_agsuite_assistant_ue`
     - **Before Load Function:** `beforeLoad`
   - Save
3. Create Deployment:
   - Click "Deploy Script"
   - Fill in:
     - **Applies To:** All Records (or specific ones)
     - **Event Type:** View, Edit, Create
     - **Status:** Testing
   - Save

### **STEP 8: Test!**

1. Log into NetSuite
2. Navigate to any page (Dashboard, Invoice, etc.)
3. Look for floating "?" button in bottom-right corner
4. Click button → Chatbot opens
5. Test searches:
   - "TDS master"
   - "TDS payment"
   - "Create invoice"
6. Click an article → Verify it loads
7. **Check dynamic links** (in articles 05 and 16):
   - Should see green "Create" buttons
   - Should see blue "View All" links
   - Click them → Should open correct NetSuite pages

---

## 🔧 MULTI-CLIENT DEPLOYMENT

### For Each New Client:

**Time Required:** ~30 minutes

#### Step 1: Upload Files (10 min)
- Upload all 25 articles to File Cabinet
- Note NEW Internal IDs (different from dev!)
- Create NEW `articles_index.json` with new IDs
- Upload index and note its ID

#### Step 2: Configure Suitelet (10 min)
- Copy `netsuite_assistant_FINAL.js`
- Update Line 21: New index file ID
- Update Lines 35-95: Client's custom record rectypes
- Save as `netsuite_assistant_FINAL_CLIENT_A.js`

#### Step 3: Deploy Scripts (10 min)
- Upload client-specific Suitelet
- Upload client script (update script IDs)
- Upload user event script
- Create script records and deployments
- Test!

**Key Point:** Same articles, same code structure—just update IDs and rectypes!

---

## 📝 ADDING PLACEHOLDERS TO MORE ARTICLES

### Placeholder Syntax:

```
[CREATE:RESOURCE]  → Creates "Create X" button
[LIST:RESOURCE]    → Creates "View All X Records" link
[VIEW:RESOURCE]    → Same as LIST
[EDIT:RESOURCE:ID] → Creates "Edit X" link (needs record ID)
```

### Available Resources:

**Custom Records:**
- TDS_MASTER, TDS_PAYMENT, TDS_CHALLAN, TDS_SECTION
- AGTAX_MATRIX, FINANCIAL_YEAR, HSN_SAC

**Standard Records:**
- TAX_CODE, TAX_GROUP
- CUSTOMER, VENDOR
- ITEM, ACCOUNT, EXPENSE_CATEGORY
- INVOICE, VENDOR_BILL
- LOCATION, SUBSIDIARY

### Example Article Update:

**BEFORE:**
```
To create a new vendor, navigate to Lists > Relationships > Vendors > New.
```

**AFTER:**
```
To create a new vendor, [CREATE:VENDOR] or view existing vendors with [LIST:VENDOR].
```

**What User Sees:**
```
To create a new vendor, [Create Vendor] or view existing vendors with [View All Vendor Records].
                         ↑ Working button    ↑ Working link
```

---

## ⚙️ CONFIGURATION REFERENCE

### Suitelet Configuration Points:

| Line | What to Update | Per Client? | Example |
|------|---------------|-------------|---------|
| 21 | INDEX_FILE_ID | ✅ Yes | `'3165'` |
| 35-70 | Custom record rectypes | ✅ Yes | `rectype=1042` |
| 72-130 | Standard records | ❌ No | Auto-works |

### Client Script Configuration:

| Line | What to Update | Per Client? | Example |
|------|---------------|-------------|---------|
| 42 | scriptId | ❌ No (same) | `'customscript_agsuite_assistant_sl'` |
| 43 | deploymentId | ❌ No (same) | `'customdeploy1'` |

---

## 🐛 TROUBLESHOOTING

### Issue: Chatbot button not appearing
**Solution:**
- Check User Event script deployment status
- Verify deployment applies to current record type
- Check browser console for errors

### Issue: Search returns no results
**Solution:**
- Verify `INDEX_FILE_ID` is correct (Line 21)
- Check articles_index.json is uploaded
- Review Script Execution Log for errors

### Issue: Dynamic links show `[TDS_MASTER]` (not configured)
**Solution:**
- Resource not in URL_MAPPINGS
- Add to URL_MAPPINGS in Suitelet (Lines 35-130)
- Verify rectypes are correct for this account

### Issue: Articles don't load
**Solution:**
- Check file_id values in articles_index.json
- Verify files are uploaded to File Cabinet
- Check Script Execution Log

### Issue: LLM quota exceeded
**Solution:**
- Set up OCI credentials: Setup > Company > AI Preferences
- Enable unlimited LLM usage
- Or reduce search frequency

---

## 📊 PERFORMANCE & COSTS

### Token Usage:
- **Per Search:** ~2,500 tokens (very efficient!)
- **Monthly (500 queries):** ~1,250,000 tokens
- **Cost:** ~$1-2/month (with OCI) or FREE tier

### Alternative (NOT recommended):
- Sending entire 75KB knowledge base: ~20,000 tokens/query
- Monthly cost: ~$15-20
- **Your system is 10x more efficient!** 🎉

---

## 🎓 TRAINING YOUR TEAM

### For Article Writers:
1. Write articles in plain text
2. Add placeholders where users need links:
   - `[CREATE:TDS_MASTER]` for creation links
   - `[LIST:VENDORS]` for list views
3. System auto-generates correct URLs per client

### For Administrators:
1. Upload articles to File Cabinet
2. Update index file with Internal IDs
3. Configure Suitelet with rectypes
4. Deploy and test
5. Monitor LLM usage in Script Execution Log

### For End Users:
1. Click "?" button on any NetSuite page
2. Search for topic (e.g., "TDS payment")
3. Click article to read
4. Click dynamic links to open NetSuite pages
5. That's it!

---

## ✅ DEPLOYMENT CHECKLIST

**Pre-Deployment:**
- [ ] All 25 articles uploaded to File Cabinet
- [ ] Internal IDs noted for all files
- [ ] articles_index.json updated with file_ids
- [ ] Index file uploaded and ID noted
- [ ] Custom record rectypes identified
- [ ] Suitelet configured (INDEX_FILE_ID + URL_MAPPINGS)

**Deployment:**
- [ ] Suitelet uploaded and deployed
- [ ] Client Script uploaded and configured
- [ ] User Event Script uploaded and deployed
- [ ] Script IDs match in client script

**Post-Deployment:**
- [ ] Chatbot button appears on pages
- [ ] Search returns results
- [ ] Articles load correctly
- [ ] Dynamic links work (if added)
- [ ] No errors in Script Execution Log
- [ ] Users can access from all roles

---

## 🚀 NEXT STEPS

1. **Deploy to Development:** Test thoroughly
2. **Add More Placeholders:** Update additional articles
3. **Deploy to Client A:** First production deployment
4. **Gather Feedback:** Improve articles based on usage
5. **Deploy to All Clients:** Roll out to remaining accounts
6. **Monitor Usage:** Track LLM quota and search patterns

---

## 📞 SUPPORT

**Issues?**
- Check Script Execution Log: Customization > Scripting > Script Execution Log
- Review this deployment guide
- Test in sandbox environment first

**Updates:**
- To update articles: Edit file, re-upload (same Internal ID = no config changes!)
- To add articles: Upload file, update index, re-upload index
- To update Suitelet: Edit code, re-upload, redeploy

---

## 🎉 CONGRATULATIONS!

You now have a production-ready, AI-powered knowledge base assistant that:
- ✅ Works across multiple clients
- ✅ Generates dynamic URLs automatically
- ✅ Is token-efficient and cost-effective
- ✅ Provides professional user experience
- ✅ Is easy to maintain and scale

**Happy deploying!** 🚀
