<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';

interface LineItem {
  item_description: string;
  quantity: number | null;
  price: number | null;
}
interface Invoice {
  document_type: 'invoice' | 'estimate' | 'purchase_order' | 'proposal' | 'unknown';
  vendor_name: string;
  counterparty_name: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number | null;
  line_items: LineItem[];
}
interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
}

const locationId = ref<string>('');
const status = ref<string>('Connecting to GoHighLevel…');
const busy = ref(false);
const invoice = ref<Invoice | null>(null);
const savedId = ref<string>('');
const error = ref<string>('');

// --- "Bill to" contact resolution, needed for real GHL Invoices/Estimates ---
const contact = ref<Contact | null>(null);
const contactQuery = ref('');
const contactResults = ref<Contact[]>([]);
const newContactName = ref('');
const newContactEmail = ref('');
const newContactPhone = ref('');
const showNewContact = ref(false);

async function searchContacts() {
  if (!contactQuery.value.trim() || !locationId.value) return;
  busy.value = true;
  try {
    const params = new URLSearchParams({ locationId: locationId.value, query: contactQuery.value });
    const res = await fetch(`/api/contacts/search?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Search failed');
    contactResults.value = data.contacts ?? [];
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}

function selectContact(c: Contact) {
  contact.value = c;
  contactResults.value = [];
}

async function createNewContact() {
  if (!newContactName.value.trim() || !locationId.value) return;
  busy.value = true;
  try {
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locationId: locationId.value,
        name: newContactName.value,
        email: newContactEmail.value || undefined,
        phone: newContactPhone.value || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Create contact failed');
    contact.value = data.contact;
    showNewContact.value = false;
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}

// Hands-free mode: when on, a successful extraction is saved to GHL immediately
// (no review click). Preference persists across sessions.
const autoSave = ref(localStorage.getItem('billwright_autosave') === '1');
watch(autoSave, (v) => localStorage.setItem('billwright_autosave', v ? '1' : '0'));

// --- GHL Custom Page SSO: ask the parent CRM for the encrypted session. ---
onMounted(() => {
  window.addEventListener('message', onMessage);
  window.parent.postMessage({ message: 'REQUEST_USER_DATA' }, '*');
});

async function onMessage({ data }: MessageEvent) {
  if (data?.message !== 'REQUEST_USER_DATA_RESPONSE') return;
  try {
    const res = await fetch('/api/sso/decrypt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ encryptedData: data.payload }),
    });
    const session = await res.json();
    locationId.value = session.activeLocation ?? '';
    status.value = locationId.value
      ? `Connected to location ${locationId.value}`
      : 'Connected, but no sub-account context was provided.';
  } catch {
    status.value = 'Could not establish a GoHighLevel session.';
  }
}

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  error.value = '';
  savedId.value = '';
  contact.value = null;
  contactResults.value = [];
  showNewContact.value = false;
  busy.value = true;
  status.value = 'Extracting document with Claude…';
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/extract', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Extraction failed');
    invoice.value = data.invoice;
    if (autoSave.value && locationId.value) {
      await save();
    } else {
      status.value = autoSave.value
        ? 'Extracted, but no location context — review and save manually.'
        : 'Review the extracted data, then save to GoHighLevel.';
    }
  } catch (err) {
    error.value = (err as Error).message;
    status.value = '';
  } finally {
    busy.value = false;
  }
}

async function save() {
  if (!invoice.value) return;
  if (!locationId.value) {
    error.value = 'No location context — open this app from inside GoHighLevel.';
    return;
  }
  busy.value = true;
  error.value = '';
  status.value = 'Logging vendor bill…';
  try {
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId: locationId.value, invoice: invoice.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Save failed');
    savedId.value = data.recordId;
    status.value = 'Saved.';
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}

async function saveAsGhlDocument(kind: 'invoice' | 'estimate') {
  if (!invoice.value || !contact.value || !locationId.value) return;
  busy.value = true;
  error.value = '';
  status.value = kind === 'invoice' ? 'Creating GoHighLevel Invoice…' : 'Creating GoHighLevel Estimate…';
  try {
    const endpoint = kind === 'invoice' ? '/api/ghl-invoices' : '/api/ghl-estimates';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId: locationId.value, invoice: invoice.value, contact: contact.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Save failed');
    savedId.value = data.recordId;
    status.value = kind === 'invoice' ? 'Invoice created.' : 'Estimate created.';
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}

function addLine() {
  invoice.value?.line_items.push({ item_description: '', quantity: null, price: null });
}
function removeLine(i: number) {
  invoice.value?.line_items.splice(i, 1);
}
</script>

<template>
  <main class="wrap">
    <h1>BillWright</h1>
    <p class="tagline">Turn any document into a fully-populated GoHighLevel invoice or estimate.</p>
    <p class="status">{{ status }}</p>

    <label class="upload">
      <input type="file" accept="application/pdf,image/*" :disabled="busy" @change="onFile" />
      <span>Choose a document (estimate, PO, proposal, or vendor invoice — PDF or image)</span>
    </label>

    <label class="autosave">
      <input type="checkbox" v-model="autoSave" :disabled="busy" />
      Auto-log as vendor bill after extraction (hands-free)
    </label>

    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="invoice" class="review">
      <p class="doctype">Detected: <strong>{{ invoice.document_type }}</strong></p>
      <div class="grid">
        <label>Counterparty<input v-model="invoice.counterparty_name" /></label>
        <label>Document #<input v-model="invoice.invoice_number" /></label>
        <label>Date<input v-model="invoice.invoice_date" /></label>
        <label>Total<input v-model.number="invoice.total_amount" type="number" step="0.01" /></label>
      </div>

      <h3>Line items</h3>
      <table>
        <thead>
          <tr><th>Description</th><th>Qty</th><th>Price</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="(li, i) in invoice.line_items" :key="i">
            <td><input v-model="li.item_description" /></td>
            <td><input v-model.number="li.quantity" type="number" /></td>
            <td><input v-model.number="li.price" type="number" step="0.01" /></td>
            <td><button class="link" @click="removeLine(i)">✕</button></td>
          </tr>
        </tbody>
      </table>
      <button class="link" @click="addLine">+ Add line item</button>

      <h3>Bill to (required for GHL Invoice / Estimate)</h3>
      <div v-if="contact" class="contact-selected">
        ✅ {{ contact.name }} <span v-if="contact.email">({{ contact.email }})</span>
        <button class="link" @click="contact = null">Change</button>
      </div>
      <div v-else class="contact-picker">
        <div class="row">
          <input v-model="contactQuery" placeholder="Search contacts by name or email" @keyup.enter="searchContacts" />
          <button :disabled="busy" @click="searchContacts">Search</button>
        </div>
        <ul v-if="contactResults.length" class="contact-results">
          <li v-for="c in contactResults" :key="c.id">
            {{ c.name }} <span v-if="c.email">({{ c.email }})</span>
            <button class="link" @click="selectContact(c)">Select</button>
          </li>
        </ul>
        <button class="link" @click="showNewContact = !showNewContact">+ New contact</button>
        <div v-if="showNewContact" class="row">
          <input v-model="newContactName" placeholder="Name" />
          <input v-model="newContactEmail" placeholder="Email" />
          <input v-model="newContactPhone" placeholder="Phone" />
          <button :disabled="busy" @click="createNewContact">Create</button>
        </div>
      </div>

      <div class="actions">
        <button :disabled="busy" @click="save">Log vendor bill</button>
        <button :disabled="busy || !contact" @click="saveAsGhlDocument('invoice')">Create GHL Invoice</button>
        <button :disabled="busy || !contact" @click="saveAsGhlDocument('estimate')">Create GHL Estimate</button>
        <span v-if="savedId" class="ok">✅ Saved (record {{ savedId }})</span>
      </div>
    </section>
  </main>
</template>

<style scoped>
.wrap { font-family: system-ui, sans-serif; max-width: 760px; margin: 0 auto; padding: 1.5rem; }
h1 { font-size: 1.4rem; margin-bottom: 0.15rem; }
.tagline { color: #444; margin: 0 0 1rem; }
.status { color: #555; }
.error { color: #b00020; }
.ok { color: #0a7c2f; margin-left: 0.75rem; }
.upload { display: inline-block; margin: 0.5rem 0 0.5rem; }
.autosave { flex-direction: row; align-items: center; gap: 0.4rem; font-size: 0.9rem; color: #333; margin-bottom: 1rem; cursor: pointer; }
.autosave input { width: auto; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
label { display: flex; flex-direction: column; font-size: 0.85rem; gap: 0.25rem; }
input { padding: 0.4rem; border: 1px solid #ccc; border-radius: 6px; }
table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; }
th, td { text-align: left; padding: 0.25rem; }
.actions { margin-top: 1rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
button { background: #2563eb; color: #fff; border: 0; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: default; }
button.link { background: none; color: #2563eb; padding: 0.2rem; }
.doctype { color: #555; font-size: 0.85rem; text-transform: capitalize; }
.contact-picker .row { display: flex; gap: 0.5rem; margin-bottom: 0.4rem; }
.contact-picker input { flex: 1; padding: 0.4rem; border: 1px solid #ccc; border-radius: 6px; }
.contact-results { list-style: none; padding: 0; margin: 0 0 0.5rem; font-size: 0.9rem; }
.contact-results li { padding: 0.25rem 0; display: flex; align-items: center; gap: 0.5rem; }
.contact-selected { font-size: 0.9rem; margin-bottom: 0.5rem; }
</style>
