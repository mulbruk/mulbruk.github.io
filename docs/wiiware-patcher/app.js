import init, { apply_patch, crc32, patch_source_crc } from './pkg/wiipyrite_web.js';

await init();

const sourceInput = document.getElementById('source-wad');
const patchInput = document.getElementById('patch-file');
const applyBtn = document.getElementById('apply-btn');
const status = document.getElementById('status');

const sourceCrc32El = document.getElementById('source-crc32');
const sourceSha1El = document.getElementById('source-sha1');
const patchSourceCrc32El = document.getElementById('patch-source-crc32');

// Holds computed values for comparison; null means not yet loaded or errored.
let sourceWadCrc = null;
let requiredCrc = null;

sourceInput.addEventListener('change', async () => {
    sourceWadCrc = null;
    sourceCrc32El.textContent = '\u00a0';
    sourceSha1El.textContent = '\u00a0';
    sourceCrc32El.className = 'hash-value';
    clearStatus();

    const file = sourceInput.files[0];
    if (!file) return;

    const data = await readFileAsBytes(file);

    const crcVal = crc32(data);
    sourceWadCrc = crcVal;
    sourceCrc32El.textContent = formatHex32(crcVal);

    const sha1Buf = await crypto.subtle.digest('SHA-1', data);
    sourceSha1El.textContent = formatHex(new Uint8Array(sha1Buf));

    updateMismatchState();
    updateButtonState();
});

patchInput.addEventListener('change', async () => {
    requiredCrc = null;
    patchSourceCrc32El.textContent = '\u00a0';
    patchSourceCrc32El.className = 'hash-value';
    clearStatus();

    const file = patchInput.files[0];
    if (!file) return;

    const data = await readFileAsBytes(file);

    try {
        const crcVal = patch_source_crc(data);
        requiredCrc = crcVal;
        patchSourceCrc32El.textContent = formatHex32(crcVal);
    } catch (e) {
        setStatus('error', 'Invalid patch file: ' + String(e));
    }

    updateMismatchState();
    updateButtonState();
});

applyBtn.addEventListener('click', async () => {
    const sourceFile = sourceInput.files[0];
    const patchFile = patchInput.files[0];

    applyBtn.disabled = true;
    setStatus('info', 'Applying patch\u2026');

    try {
        const [sourceData, patchData] = await Promise.all([
            readFileAsBytes(sourceFile),
            readFileAsBytes(patchFile),
        ]);

        const result = apply_patch(patchData, sourceData);

        const outputName = patchedFilename(patchFile.name);
        triggerDownload(result, outputName);
        setStatus('success', `Patch applied. Downloading as \u201c${outputName}\u201d.`);
    } catch (e) {
        setStatus('error', String(e));
    } finally {
        updateButtonState();
    }
});

function updateMismatchState() {
    const mismatch = sourceWadCrc !== null
        && requiredCrc !== null
        && sourceWadCrc !== requiredCrc;

    sourceCrc32El.className = 'hash-value' + (mismatch ? ' mismatch' : '');
    patchSourceCrc32El.className = 'hash-value' + (mismatch ? ' mismatch' : '');

    if (mismatch) {
        setStatus('error', 'CRC32 mismatch: the selected WAD does not match the patch\u2019s required source.');
    } else if (status.className.includes('error') && status.textContent.includes('CRC32 mismatch')) {
        clearStatus();
    }
}

function updateButtonState() {
    const hasSource = sourceInput.files.length > 0;
    const hasPatch = patchInput.files.length > 0 && requiredCrc !== null;
    const mismatch = sourceWadCrc !== null && requiredCrc !== null && sourceWadCrc !== requiredCrc;
    applyBtn.disabled = !(hasSource && hasPatch && !mismatch);
}

function readFileAsBytes(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

function patchedFilename(name) {
    const dot = name.lastIndexOf('.');
    return dot !== -1
        ? name.slice(0, dot) + '.wad' /* '_patched' + name.slice(dot) */
        : name + '_patched';
}

function triggerDownload(data, filename) {
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function setStatus(level, message) {
    status.textContent = message;
    status.className = 'status ' + level;
}

function clearStatus() {
    status.textContent = '';
    status.className = 'status hidden';
}

function formatHex32(n) {
    return n.toString(16).toUpperCase().padStart(8, '0');
}

function formatHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
