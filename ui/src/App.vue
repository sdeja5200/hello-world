<script setup lang="ts">
import { onMounted, ref } from 'vue';

interface LineItem {
  item_description: string;
  quantity: number | null;
  price: number | null;
}
interface Invoice {
  vendor_name: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number | null;
  line_items: LineItem[];
}

const locationId = ref<string>('');
const status = ref<string>('Connecting to GoHighLevel…');
const busy = ref(false);
const invoice = ref<Invoice | null>(null);
const savedId = ref<string>('');
const error = ref<string>('');

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
  busy.value = true;
  status.value = 'Extracting invoice with Claude…';
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/extract', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Extraction failed');
    invoice.value = data.invoice;
    status.value = 'Review the extracted data, then save to GoHighLevel.';
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
  status.value = 'Saving to GoHighLevel…';
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

function addLine() {
  invoice.value?.line_items.push({ item_description: '', quantity: null, price: null });
}
function removeLine(i: number) {
  invoice.value?.line_items.splice(i, 1);
}
</script>

<template>
  <main class="wrap">
    <h1>Voxlink Invoice Pro</h1>
    <p class="tagline">Automated AI invoice parsing and line-item extraction for your CRM.</p>
    <p class="status">{{ status }}</p>

    <label class="upload">
      <input type="file" accept="application/pdf,image/*" :disabled="busy" @change="onFile" />
      <span>Choose an invoice (PDF or image)</span>
    </label>

    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="invoice" class="review">
      <div class="grid">
        <label>Vendor<input v-model="invoice.vendor_name" /></label>
        <label>Invoice #<input v-model="invoice.invoice_number" /></label>
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

      <div class="actions">
        <button :disabled="busy" @click="save">Save to GoHighLevel</button>
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
.upload { display: inline-block; margin: 0.5rem 0 1rem; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
label { display: flex; flex-direction: column; font-size: 0.85rem; gap: 0.25rem; }
input { padding: 0.4rem; border: 1px solid #ccc; border-radius: 6px; }
table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; }
th, td { text-align: left; padding: 0.25rem; }
.actions { margin-top: 1rem; display: flex; align-items: center; }
button { background: #2563eb; color: #fff; border: 0; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: default; }
button.link { background: none; color: #2563eb; padding: 0.2rem; }
</style>
