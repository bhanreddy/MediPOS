"""Build the three MedPOS quick manuals as printable HTML and editable Markdown.

PDFs are printed from the HTML with Chromium so Telugu text is shaped correctly.
"""
from pathlib import Path
from html import escape
import json

ROOT = Path(__file__).resolve().parent
DATA = {
"english": {
"lang": "en", "edition": "English", "title": "Simple user manual",
"intro": "A practical guide for medical shop owners and billing staff. Use MedPOS to prepare bills, record stock and check daily business.",
"pages": [
 {"title": "Start here", "sections": [
  {"title": "1  Sign in", "steps": ["Open the MedPOS website or app supplied by your shop administrator. Keep your internet connection on.", "Enter your Email address and Password. Select Sign in. Check that the correct shop name appears.", "If access or subscription is restricted, ask the shop owner or administrator for help."]},
  {"title": "2  Find your work area", "bullets": ["Dashboard: see the shop overview and stock alerts.", "Billing: create bills and find previous invoices.", "Inventory: check medicine quantities, batches and expiry dates.", "Purchases and Suppliers: record incoming stock and vendors.", "Customers, Expenses and Reports: manage buyers, costs and business totals."]},
  {"title": "3  Before the first bill", "bullets": ["Ask the owner to check shop details in Settings, including invoice details and the UPI ID if used.", "Make sure your medicines and opening stock have been entered. Connect the receipt printer if you use one."]}
 ], "note": "This guide follows the web app. On mobile, use Home, Stock, Sales and More; tap Home > New sale to start billing. Button names can differ by screen and account access."},
 {"title": "Make a customer bill", "sections": [
  {"title": "4  Create a sale", "steps": ["Open Billing > New invoice.", "Search for a medicine and select the correct result. Check its batch, expiry and available stock.", "Enter the quantity. Repeat for the other medicines. Check the price, discount if used, and final total.", "Choose the customer when needed. For Credit, select a saved customer.", "Choose Cash, UPI, Card or Credit. Check Amount received; for Credit, use Received now for any part payment.", "Select Confirm sale (or Confirm on a compact screen). For UPI, verify receipt in the shop payment account before confirming payment.", "Wait for the saved invoice or success message. Print the receipt if needed."]},
  {"title": "Understand the payment", "bullets": ["Cash: check the money received and return the displayed change.", "UPI or Card: verify that payment succeeded. A displayed QR code alone does not confirm payment.", "Credit: the unpaid amount becomes the customer's balance due. The app checks the customer's credit limit."]},
  {"title": "5  Find or reprint a bill", "steps": ["Open Billing and search for the invoice or customer; use the date filters if needed.", "Use the view icon to inspect the invoice, or the printer icon to reprint it."]}
 ], "note": "If printing fails after the invoice is saved, reprint the existing invoice. Before retrying an uncertain sale, check Billing to avoid creating a duplicate."},
 {"title": "Manage stock and purchases", "sections": [
  {"title": "6  Check or add stock", "steps": ["Open Inventory. Search by medicine or batch. Read In stock, Expiry and Status.", "To enter opening or direct stock, choose Add batch (F6). Search for the medicine; use the new medicine option only when it is missing.", "Enter the batch number, expiry, quantity, cost, MRP and sales rate shown on the form. Check the unit carefully, for example a strip or a tablet.", "Save the batch and confirm that it appears in Inventory."]},
  {"title": "7  Record a supplier purchase", "steps": ["If the vendor is new, open Suppliers > Add supplier. Enter the company name and available contact details, then Save supplier.", "Open Purchases > New purchase. Choose the supplier; enter the supplier invoice number and received date.", "Choose Add item (F6). Select the medicine and enter batch, expiry, quantity, cost and MRP. Add each item.", "Compare the entries and total with the supplier bill. Select Save purchase (F12). Check for Purchase saved and verify the stock."]},
  {"title": "Watch stock alerts", "bullets": ["Check low stock and expiring stock each day. Reorder or Shortbook helps track medicines to buy.", "Keep expired or damaged stock apart and ask the responsible person to handle it."]}
 ], "note": "Record each incoming batch once. Do not enter the same supplier stock through both Add batch and New purchase, because both add stock."},
 {"title": "Customers and daily records", "sections": [
  {"title": "8  Add a customer", "steps": ["Open Customers > Add customer.", "Enter the name and a valid 10-digit mobile number. Add an email and credit limit if needed.", "Save the customer. Select this saved record during billing when giving credit. Check Balance due in invoice details."]},
  {"title": "9  Record an expense", "steps": ["Open Expenses > Record expense.", "Choose the category and enter the amount, date, payment method and a clear description.", "Select Save expense. Check the new entry in the list."]},
  {"title": "10  View a report", "steps": ["Open Reports and choose Sales report, Purchase report, Expense report, GST report or Profit & loss.", "Set From and To dates for the period you want.", "Select Generate report and read the preview. If you change the report or dates, generate it again."]},
  {"title": "Mobile navigation", "bullets": ["Stock opens medicine stock; Sales opens past bills.", "More contains Patients, Expenses, Reports, Accounting, Purchases, Suppliers and Shortbook.", "Open Settings from Home when needed. Mobile forms may use different labels from the web steps."]}
 ], "note": "Totals marked 'on this page' cover only the visible list page. Use Reports with the correct date range for period totals."},
 {"title": "Daily routine and help", "sections": [
  {"title": "Start and finish the day", "bullets": ["Start: sign in, check the shop name, internet, printer and stock alerts.", "During the day: record every sale, purchase and expense; check each save result.", "Close: generate today's sales and expense reports. Compare recorded cash, UPI and card receipts with the actual collections; review credit dues.", "Sign out using the account's logout control, especially on a shared device."]},
  {"title": "If something goes wrong", "bullets": ["Cannot sign in: check the email, password and internet. Ask the administrator if access remains blocked.", "Medicine missing: check the spelling and Inventory. Ask the stock manager to add a missing medicine or batch.", "Insufficient stock or no sellable batch: check quantity, batch and expiry. Correct the stock record or record a genuine inward purchase.", "Save seems stuck or internet drops: reconnect and check the relevant list before retrying. Treat the entry as complete only after a saved record is visible.", "Printer fails: check the printer connection and paper. Reprint the saved bill from Billing.", "Wrong saved bill or return: note the invoice number and ask the owner or authorized staff to handle the correction or return."]},
  {"title": "Useful words", "bullets": ["Batch: a particular lot of medicine. Expiry: the last usable date shown for that batch.", "MRP: maximum retail price. Credit / Balance due: money the customer still owes."]}
 ], "note": "When asking for help, give the screen name, invoice or batch number, time and exact error message. Keep passwords and customer details private."}
 ]},
"telugu": {
"lang": "te", "edition": "తెలుగు", "title": "సులభమైన వినియోగదారు మార్గదర్శిని",
"intro": "మెడికల్ షాపు యజమానులు, బిల్లింగ్ సిబ్బంది కోసం సులభమైన గైడ్. బిల్లులు తయారు చేయడం, సరుకు నమోదు చేయడం, రోజువారీ లెక్కలు చూడడం నేర్చుకోండి.",
"pages": [
 {"title": "మొదట చేయాల్సినవి", "sections": [
  {"title": "1  ఖాతాలోకి ప్రవేశించండి", "steps": ["మీ షాపు నిర్వాహకుడు ఇచ్చిన MedPOS వెబ్‌సైట్ లేదా యాప్ తెరవండి. ఇంటర్నెట్ కనెక్షన్ ఉండాలి.", "ఈమెయిల్ చిరునామా (Email address), పాస్‌వర్డ్ (Password) నమోదు చేసి Sign in నొక్కండి. మీ షాపు పేరు సరిగ్గా ఉందో చూడండి.", "ఖాతా అనుమతి లేదా చందా సమస్య కనిపిస్తే యజమాని లేదా నిర్వాహకుడిని సంప్రదించండి."]},
  {"title": "2  ముఖ్యమైన విభాగాలు", "bullets": ["Dashboard: షాపు వివరాలు, సరుకు హెచ్చరికలు.", "Billing: కొత్త బిల్లు తయారీ, పాత బిల్లుల పరిశీలన.", "Inventory: మందుల నిల్వ, బ్యాచ్, గడువు వివరాలు.", "Purchases, Suppliers: వచ్చిన సరుకు, సరఫరాదారుల నమోదు.", "Customers, Expenses, Reports: వినియోగదారులు, ఖర్చులు, వ్యాపార లెక్కలు."]},
  {"title": "3  మొదటి బిల్లుకు ముందు", "bullets": ["Settings లో షాపు, బిల్లు వివరాలు సరిగ్గా ఉన్నాయో యజమానితో చూడించండి. వాడుతుంటే UPI ID కూడా తనిఖీ చేయండి.", "మందులు, ప్రారంభ నిల్వ నమోదు అయ్యాయో చూడండి. రసీదు ప్రింటర్ వాడితే దాన్ని కనెక్ట్ చేయండి."]}
 ], "note": "ఈ సూచనలు వెబ్ యాప్ ఆధారంగా ఉన్నాయి. మొబైల్‌లో Home, Stock, Sales, More వాడండి. కొత్త బిల్లుకు Home > New sale నొక్కండి. తెర, ఖాతా అనుమతులను బట్టి బటన్ పేర్లు మారవచ్చు."},
 {"title": "వినియోగదారునికి బిల్లు ఇవ్వడం", "sections": [
  {"title": "4  కొత్త అమ్మకం నమోదు చేయండి", "steps": ["Billing > New invoice తెరవండి.", "మందు పేరు వెతికి సరైన మందును ఎంచుకోండి. బ్యాచ్, గడువు, అందుబాటులో ఉన్న నిల్వ చూడండి.", "అమ్మే పరిమాణం నమోదు చేయండి. మిగతా మందులనూ చేర్చండి. ధర, వర్తిస్తే తగ్గింపు, మొత్తం తనిఖీ చేయండి.", "అవసరమైతే వినియోగదారుని ఎంచుకోండి. ఉధారానికి (Credit) సేవ్ చేసిన వినియోగదారుని తప్పక ఎంచుకోండి.", "Cash, UPI, Card లేదా Credit ఎంచుకోండి. అందుకున్న మొత్తం (Amount received) చూడండి. ఉధారంలో కొంత చెల్లిస్తే Received now లో నమోదు చేయండి.", "Confirm sale లేదా చిన్న తెరలో Confirm నొక్కండి. UPI చెల్లింపును నిర్ధారించే ముందు షాపు ఖాతాలో డబ్బు వచ్చిందో చూడండి.", "బిల్లు సేవ్ అయినట్లు సందేశం వచ్చేవరకు వేచి ఉండండి. అవసరమైతే రసీదు ముద్రించండి."]},
  {"title": "చెల్లింపు వివరాలు", "bullets": ["Cash: తీసుకున్న నగదు, తిరిగి ఇవ్వాల్సిన చిల్లర తనిఖీ చేయండి.", "UPI / Card: చెల్లింపు విజయవంతమైందో చూడండి. QR కనిపించడం మాత్రమే చెల్లింపుకు ఆధారం కాదు.", "Credit: మిగిలిన మొత్తం వినియోగదారుని బాకీకి చేరుతుంది. ఉధార పరిమితిని యాప్ తనిఖీ చేస్తుంది."]},
  {"title": "5  పాత బిల్లు చూడండి లేదా ముద్రించండి", "steps": ["Billing లో బిల్లు లేదా వినియోగదారుని వెతకండి. అవసరమైతే తేదీలు ఎంచుకోండి.", "బిల్లు చూడటానికి వీక్షణ గుర్తు, మళ్లీ ముద్రించడానికి ప్రింటర్ గుర్తు నొక్కండి."]}
 ], "note": "బిల్లు సేవ్ అయి ముద్రణ విఫలమైతే అదే బిల్లును మళ్లీ ముద్రించండి. అమ్మకం సేవ్ అయిందో తెలియకపోతే మరోసారి నమోదు చేసే ముందు Billing లో చూడండి."},
 {"title": "మందుల నిల్వ మరియు కొనుగోళ్లు", "sections": [
  {"title": "6  నిల్వ చూడండి లేదా చేర్చండి", "steps": ["Inventory తెరవండి. మందు లేదా బ్యాచ్ వెతకండి. నిల్వ (In stock), గడువు (Expiry), స్థితి (Status) చూడండి.", "ప్రారంభ లేదా నేరుగా వచ్చిన సరుకు కోసం Add batch (F6) ఎంచుకోండి. మందు వెతకండి. లేకపోతే మాత్రమే కొత్త మందు చేర్చే ఎంపిక వాడండి.", "బ్యాచ్ నంబరు, గడువు, పరిమాణం, కొనుగోలు ధర, MRP, అమ్మకపు ధర నమోదు చేయండి. పరిమాణం స్ట్రిప్పులలోనా, మాత్రలలోనా జాగ్రత్తగా చూడండి.", "బ్యాచ్ సేవ్ చేసి Inventory లో కనిపిస్తుందో నిర్ధారించుకోండి."]},
  {"title": "7  సరఫరాదారు కొనుగోలు నమోదు చేయండి", "steps": ["కొత్త సరఫరాదారు అయితే Suppliers > Add supplier తెరవండి. కంపెనీ పేరు, ఉన్న సంప్రదింపు వివరాలు నమోదు చేసి Save supplier నొక్కండి.", "Purchases > New purchase తెరవండి. సరఫరాదారుని ఎంచుకుని వారి బిల్లు నంబరు, సరుకు అందిన తేదీ నమోదు చేయండి.", "Add item (F6) నొక్కండి. మందు, బ్యాచ్, గడువు, పరిమాణం, కొనుగోలు ధర, MRP నమోదు చేయండి. ప్రతి మందునూ చేర్చండి.", "సరఫరాదారు బిల్లుతో వివరాలు, మొత్తం పోల్చండి. Save purchase (F12) నొక్కండి. Purchase saved సందేశం, పెరిగిన నిల్వ తనిఖీ చేయండి."]},
  {"title": "నిల్వ హెచ్చరికలు చూడండి", "bullets": ["తక్కువ నిల్వ, గడువు దగ్గరపడుతున్న మందులను రోజూ చూడండి. కొనాల్సిన మందులకు Reorder లేదా Shortbook చూడండి.", "గడువు ముగిసిన లేదా దెబ్బతిన్న సరుకును వేరుగా ఉంచి బాధ్యుడికి తెలియజేయండి."]}
 ], "note": "ఒకసారి వచ్చిన సరుకును ఒక్కసారే నమోదు చేయండి. అదే సరుకును Add batch, New purchase రెండింటిలో నమోదు చేస్తే నిల్వ రెండుసార్లు పెరుగుతుంది."},
 {"title": "వినియోగదారులు మరియు రోజువారీ లెక్కలు", "sections": [
  {"title": "8  వినియోగదారుని చేర్చండి", "steps": ["Customers > Add customer తెరవండి.", "పేరు, సరైన 10 అంకెల మొబైల్ నంబరు నమోదు చేయండి. అవసరమైతే ఈమెయిల్, ఉధార పరిమితి చేర్చండి.", "వివరాలు సేవ్ చేయండి. ఉధార బిల్లు ఇస్తున్నప్పుడు ఈ వినియోగదారుని ఎంచుకోండి. బిల్లు వివరాల్లో బాకీ (Balance due) చూడండి."]},
  {"title": "9  ఖర్చు నమోదు చేయండి", "steps": ["Expenses > Record expense తెరవండి.", "ఖర్చు రకం, మొత్తం, తేదీ, చెల్లింపు విధానం, స్పష్టమైన వివరణ నమోదు చేయండి.", "Save expense నొక్కి కొత్త నమోదు జాబితాలో ఉందో చూడండి."]},
  {"title": "10  నివేదిక చూడండి", "steps": ["Reports లో అమ్మకాలు (Sales report), కొనుగోళ్లు (Purchase report), ఖర్చులు (Expense report), GST report లేదా లాభనష్టాలు (Profit & loss) ఎంచుకోండి.", "కావాల్సిన కాలానికి ప్రారంభ తేదీ (From), చివరి తేదీ (To) ఎంచుకోండి.", "Generate report నొక్కి ఫలితాలు చూడండి. తేదీలు లేదా నివేదిక మార్చితే మళ్లీ తయారు చేయండి."]},
  {"title": "మొబైల్‌లో ఎక్కడ చూడాలి", "bullets": ["Stock లో మందుల నిల్వ, Sales లో పాత బిల్లులు ఉంటాయి.", "More లో Patients, Expenses, Reports, Accounting, Purchases, Suppliers, Shortbook ఉంటాయి.", "Settings కోసం Home నుంచి తెరవండి. మొబైల్ ఫారమ్‌ల పేర్లు వెబ్‌తో కొంత మారవచ్చు."]}
 ], "note": "'on this page' అని ఉన్న మొత్తం ప్రస్తుతం కనిపించే జాబితా పేజీకి మాత్రమే. ఒక కాలానికి పూర్తి లెక్కల కోసం Reports లో సరైన తేదీలు ఎంచుకోండి."},
 {"title": "రోజువారీ పని మరియు సహాయం", "sections": [
  {"title": "రోజు ప్రారంభంలో మరియు చివరలో", "bullets": ["ప్రారంభంలో: ఖాతాలోకి ప్రవేశించి షాపు పేరు, ఇంటర్నెట్, ప్రింటర్, నిల్వ హెచ్చరికలు చూడండి.", "పని సమయంలో: ప్రతి అమ్మకం, కొనుగోలు, ఖర్చు నమోదు చేసి సేవ్ అయిందో చూడండి.", "రోజు చివరలో: నేటి అమ్మకాలు, ఖర్చుల నివేదికలు చూడండి. నగదు, UPI, కార్డు వసూళ్లను వాస్తవ మొత్తాలతో పోల్చండి. బాకీలు చూడండి.", "పంచుకుని వాడే పరికరంలో పని ముగిసిన తర్వాత ఖాతా నుంచి బయటకు రావడానికి లాగౌట్ ఎంపిక వాడండి."]},
  {"title": "సమస్య వస్తే", "bullets": ["ప్రవేశించలేకపోతే: ఈమెయిల్, పాస్‌వర్డ్, ఇంటర్నెట్ తనిఖీ చేయండి. సమస్య కొనసాగితే నిర్వాహకుడిని సంప్రదించండి.", "మందు కనిపించకపోతే: అక్షరాలు, Inventory చూడండి. అవసరమైతే నిల్వ బాధ్యుడితో మందు లేదా బ్యాచ్ చేర్పించండి.", "నిల్వ సరిపోకపోతే: పరిమాణం, బ్యాచ్, గడువు చూడండి. నిల్వ నమోదు సరిచేయండి లేదా నిజంగా వచ్చిన సరుకును నమోదు చేయండి.", "సేవ్ ఆగిపోయినా, ఇంటర్నెట్ పోయినా: కనెక్షన్ వచ్చిన తర్వాత సంబంధిత జాబితా చూడండి. సేవ్ అయిన నమోదు కనిపించినప్పుడే పూర్తయినట్లు భావించండి. తర్వాతే మళ్లీ ప్రయత్నించండి.", "ప్రింటర్ పనిచేయకపోతే: కనెక్షన్, కాగితం చూడండి. సేవ్ అయిన బిల్లును Billing నుంచి మళ్లీ ముద్రించండి.", "తప్పు బిల్లు లేదా తిరిగి ఇచ్చిన సరుకు: బిల్లు నంబరు రాసుకుని యజమాని లేదా అనుమతి ఉన్న సిబ్బంది సహాయం తీసుకోండి."]},
  {"title": "పదాల అర్థాలు", "bullets": ["Batch: ఒక మందు తయారీ లాట్. Expiry: ఆ బ్యాచ్‌కు చూపించే వినియోగ గడువు.", "MRP: గరిష్ఠ చిల్లర ధర. Credit / Balance due: వినియోగదారు ఇంకా చెల్లించాల్సిన బాకీ."]}
 ], "note": "సహాయం కోరేటప్పుడు తెర పేరు, బిల్లు లేదా బ్యాచ్ నంబరు, సమయం, వచ్చిన లోప సందేశం చెప్పండి. పాస్‌వర్డ్‌లు, వినియోగదారుల వివరాలను గోప్యంగా ఉంచండి."}
 ]},
"hybrid": {
"lang": "te", "edition": "Telugu + English", "title": "Simple User Manual • సులభమైన గైడ్",
"intro": "Medical shop owners, billing staff కోసం easy guide. MedPOS లో bills చేయడం, stock నమోదు చేయడం, daily reports చూడడం కోసం ఈ steps follow అవ్వండి.",
"pages": [
 {"title": "Getting started • ప్రారంభం", "sections": [
  {"title": "1  Login చేయండి", "steps": ["Shop administrator ఇచ్చిన MedPOS website లేదా app open చేయండి. Internet connection on లో ఉంచండి.", "Email address, Password enter చేసి Sign in నొక్కండి. మీ shop name correct గా ఉందో check చేయండి.", "Access లేదా subscription issue వస్తే owner లేదా administrator ని సంప్రదించండి."]},
  {"title": "2  Main menus తెలుసుకోండి", "bullets": ["Dashboard: shop overview, stock alerts చూడండి.", "Billing: new bills చేయండి; old invoices వెతకండి.", "Inventory: medicines, stock, batches, expiry చూడండి.", "Purchases / Suppliers: incoming stock, vendor details నమోదు చేయండి.", "Customers / Expenses / Reports: buyers, costs, business totals చూడండి."]},
  {"title": "3  First bill ముందు", "bullets": ["Settings లో shop details, invoice details owner తో check చేయించండి. UPI use చేస్తే UPI ID కూడా verify చేయండి.", "Medicines, opening stock enter అయ్యాయో చూడండి. Receipt printer use చేస్తే connect చేయండి."]}
 ], "note": "ఈ steps web app కోసం. Mobile లో Home, Stock, Sales, More use చేయండి. Billing start చేయడానికి Home > New sale నొక్కండి. Screen, account access బట్టి labels మారవచ్చు."},
 {"title": "Billing • బిల్లు తయారు చేయడం", "sections": [
  {"title": "4  New sale చేయండి", "steps": ["Billing > New invoice open చేయండి.", "Medicine search చేసి correct item select చేయండి. Batch, expiry, available stock check చేయండి.", "Quantity enter చేయండి. ఇతర medicines కూడా add చేయండి. Price, discount ఉంటే అది, final total check చేయండి.", "అవసరమైతే customer select చేయండి. Credit bill కోసం saved customer తప్పనిసరి.", "Cash, UPI, Card లేదా Credit choose చేయండి. Amount received check చేయండి. Credit part payment అయితే Received now లో enter చేయండి.", "Confirm sale లేదా compact screen లో Confirm నొక్కండి. UPI payment confirm చేసే ముందు shop account లో amount received అయిందో verify చేయండి.", "Invoice saved / success message వచ్చే వరకు wait చేయండి. అవసరమైతే receipt print చేయండి."]},
  {"title": "Payment basics", "bullets": ["Cash: received cash, ఇవ్వాల్సిన change check చేయండి.", "UPI / Card: payment success verify చేయండి. QR code కనిపిస్తేనే payment complete అయినట్లు కాదు.", "Credit: unpaid amount customer balance due కి add అవుతుంది. App credit limit check చేస్తుంది."]},
  {"title": "5  Old invoice / Reprint", "steps": ["Billing లో invoice లేదా customer search చేయండి. అవసరమైతే date filters use చేయండి.", "View icon తో bill చూడండి. Printer icon తో same invoice reprint చేయండి."]}
 ], "note": "Invoice save అయి print fail అయితే existing bill reprint చేయండి. Sale save అయిందో doubt ఉంటే retry ముందు Billing లో check చేసి duplicate bill avoid చేయండి."},
 {"title": "Stock and purchases • సరుకు నమోదు", "sections": [
  {"title": "6  Stock check / Add batch", "steps": ["Inventory open చేసి medicine లేదా batch search చేయండి. In stock, Expiry, Status చూడండి.", "Opening లేదా direct stock కోసం Add batch (F6) ఎంచుకోండి. Medicine search చేయండి. Missing అయితేనే new medicine option use చేయండి.", "Batch number, expiry, quantity, cost, MRP, sales rate enter చేయండి. Quantity unit strip లేదా tablet అనేది carefully check చేయండి.", "Batch save చేసి Inventory లో కనిపిస్తుందో confirm చేయండి."]},
  {"title": "7  Supplier purchase entry", "steps": ["New vendor అయితే Suppliers > Add supplier open చేయండి. Company name, available contact details enter చేసి Save supplier నొక్కండి.", "Purchases > New purchase open చేయండి. Supplier choose చేసి supplier invoice number, received date enter చేయండి.", "Add item (F6) నొక్కండి. Medicine, batch, expiry, quantity, cost, MRP enter చేసి ప్రతి item add చేయండి.", "Supplier bill తో entries, total compare చేయండి. Save purchase (F12) నొక్కండి. Purchase saved message, updated stock verify చేయండి."]},
  {"title": "Stock alerts", "bullets": ["Low stock, expiring medicines daily check చేయండి. కొనాల్సిన items కోసం Reorder లేదా Shortbook చూడండి.", "Expired / damaged stock వేరుగా ఉంచి responsible person కి చెప్పండి."]}
 ], "note": "Incoming stock ఒక్కసారే enter చేయండి. Same supplier stock ని Add batch, New purchase రెండింటిలో enter చేస్తే stock double అవుతుంది."},
 {"title": "Customers, expenses and reports", "sections": [
  {"title": "8  Customer add చేయండి", "steps": ["Customers > Add customer open చేయండి.", "Name, valid 10-digit mobile number enter చేయండి. అవసరమైతే email, credit limit add చేయండి.", "Customer save చేయండి. Credit billing లో ఈ saved record select చేయండి. Invoice details లో Balance due చూడండి."]},
  {"title": "9  Expense record చేయండి", "steps": ["Expenses > Record expense open చేయండి.", "Category, amount, date, payment method, clear description enter చేయండి.", "Save expense నొక్కి list లో new entry ఉందో check చేయండి."]},
  {"title": "10  Report చూడండి", "steps": ["Reports లో Sales report, Purchase report, Expense report, GST report లేదా Profit & loss choose చేయండి.", "కావాల్సిన period కోసం From, To dates select చేయండి.", "Generate report నొక్కి preview చూడండి. Report లేదా dates మార్చితే మళ్లీ generate చేయండి."]},
  {"title": "Mobile shortcuts", "bullets": ["Stock లో medicine stock, Sales లో past bills చూడండి.", "More లో Patients, Expenses, Reports, Accounting, Purchases, Suppliers, Shortbook ఉంటాయి.", "Home నుంచి Settings open చేయండి. Mobile forms లో labels web కంటే కొంత different గా ఉండవచ్చు."]}
 ], "note": "'on this page' totals current list page కి మాత్రమే. పూర్తి period totals కోసం Reports లో correct date range select చేయండి."},
 {"title": "Daily routine • సహాయం", "sections": [
  {"title": "Daily checklist", "bullets": ["Start: sign in చేసి shop name, internet, printer, stock alerts check చేయండి.", "During work: ప్రతి sale, purchase, expense record చేసి save result check చేయండి.", "Day close: today's sales, expense reports generate చేయండి. Cash, UPI, Card receipts ని actual collections తో compare చేయండి; credit dues review చేయండి.", "Shared device లో పని పూర్తయ్యాక account logout control తో sign out చేయండి."]},
  {"title": "Common issues", "bullets": ["Login fail: email, password, internet check చేయండి. Access ఇంకా block అయితే administrator ని అడగండి.", "Medicine missing: spelling, Inventory check చేయండి. Missing medicine / batch stock manager తో add చేయించండి.", "Insufficient stock / no sellable batch: quantity, batch, expiry check చేయండి. Stock record correct చేయండి లేదా నిజంగా వచ్చిన stock కి purchase entry చేయండి.", "Save stuck / network lost: reconnect చేసి retry ముందు relevant list check చేయండి. Saved record కనిపించిన తర్వాతే entry complete గా భావించండి.", "Print fail: printer connection, paper check చేయండి. Billing నుంచి saved invoice reprint చేయండి.", "Wrong saved bill / return: invoice number note చేసి owner లేదా authorized staff help తీసుకోండి."]},
  {"title": "Simple meanings", "bullets": ["Batch: medicine lot. Expiry: ఆ batch కి చూపించిన usage end date.", "MRP: maximum retail price. Credit / Balance due: customer ఇంకా చెల్లించాల్సిన amount."]}
 ], "note": "Help కోసం screen name, invoice / batch number, time, exact error message ఇవ్వండి. Passwords, customer details private గా ఉంచండి."}
 ]}
}

CSS = '''
@page { size: A4; margin: 16mm 17mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #1d2c37; font: 11pt/1.55 Arial, 'Telugu Sangam MN', sans-serif; }
html[lang=te] body { font-size: 11.4pt; line-height: 1.6; }
.sheet { height: 264mm; position: relative; break-after: page; padding-bottom: 17mm; }
.sheet:last-child { break-after: auto; }
.brand { font: bold 10pt Arial, sans-serif; color: #18736e; letter-spacing: 1px; margin-bottom: 7mm; }
.edition { float: right; font-weight: normal; letter-spacing: 0; }
h1 { margin: 0 0 4mm; font-size: 25pt; line-height: 1.25; color: #153c43; }
h2 { margin: 0 0 5mm; font-size: 20pt; line-height: 1.4; color: #153c43; }
h3 { margin: 5mm 0 2mm; font-size: 12.5pt; line-height: 1.5; color: #176b65; }
.intro { margin: 0 0 5mm; color: #4e626d; }
.chapter { margin: 4mm 0 3mm; font-size: 17pt; font-weight: bold; color: #153c43; }
ul, ol { margin: 1mm 0 3mm; padding-left: 6mm; }
li { padding-left: 1mm; margin: 0 0 2mm; }
.note { margin-top: 5mm; padding: 3mm 4mm; border-left: 3px solid #208277; background: #f0f7f5; font-size: 10.3pt; line-height: 1.6; }
.footer { position: absolute; bottom: 0; left: 0; right: 0; font: 9pt Arial, 'Telugu Sangam MN', sans-serif; color: #647680; display: flex; justify-content: space-between; }
@media screen { body { background: #e9edef; } .sheet { width: 210mm; height: 297mm; margin: 7mm auto; background: white; padding: 16mm 17mm 30mm; box-shadow: 0 2px 14px #0001; } .footer { bottom: 16mm; left: 17mm; right: 17mm; } }
'''

for key, manual in DATA.items():
    title = "MedPOS " + manual['title']
    blocks, md = [], [f"# {title}", "", manual['edition'], "", manual['intro'], ""]
    for index, page in enumerate(manual['pages'], 1):
        content = [f'<section class="sheet"><div class="brand">MEDPOS <span class="edition">{escape(manual["edition"])}</span></div>']
        if index == 1:
            content += [f'<h1>{escape(manual["title"])}</h1>', f'<p class="intro">{escape(manual["intro"])}</p>', f'<div class="chapter">{escape(page["title"])}</div>']
        else:
            content += [f'<h2>{escape(page["title"])}</h2>']
        md += [f'## {page["title"]}', '']
        for section in page['sections']:
            content.append(f'<h3>{escape(section["title"])}</h3>')
            md += [f'### {section["title"]}', '']
            kind = 'steps' if 'steps' in section else 'bullets'
            tag = 'ol' if kind == 'steps' else 'ul'
            content.append('<' + tag + '>' + ''.join('<li>' + escape(item) + '</li>' for item in section[kind]) + '</' + tag + '>')
            for n, item in enumerate(section[kind], 1):
                md.append((str(n) + '. ' if kind == 'steps' else '- ') + item)
            md.append('')
        content += [f'<div class="note">{escape(page["note"])}</div>', f'<div class="footer"><span>MedPOS · {escape(manual["edition"])} · 28 Oct 2026</span><span>{index} / 5</span></div></section>']
        blocks.append(''.join(content))
        md += ['> ' + page['note'], '']
    (ROOT / f'medpos-user-manual-{key}.html').write_text(f'<!doctype html><html lang="{manual["lang"]}"><head><meta charset="utf-8"><title>{escape(title)}</title><style>{CSS}</style></head><body>{"".join(blocks)}</body></html>', encoding='utf-8')
    (ROOT / f'medpos-user-manual-{key}.md').write_text('\n'.join(md), encoding='utf-8')
print('Created three HTML manuals and three Markdown sources.')
