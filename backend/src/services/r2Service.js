/**
 * Cloudflare R2 Storage Service
 * S3-compatible — zero egress cost, 10 GB free storage.
 *
 * Required .env variables:
 *   R2_ACCOUNT_ID      — from Cloudflare dashboard → R2 → Overview
 *   R2_ACCESS_KEY_ID   — R2 API token (Access Key ID)
 *   R2_SECRET_ACCESS_KEY — R2 API token (Secret Access Key)
 *   R2_BUCKET_NAME     — your bucket name (e.g. "radiostudio-audio")
 *   R2_PUBLIC_URL      — public bucket URL (e.g. https://pub-xxx.r2.dev)
 *                        Enable "Public access" on the bucket to get this.
 */

const { S3Client, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

const R2_ACCOUNT_ID       = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID    = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME      = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL       = process.env.R2_PUBLIC_URL; // no trailing slash

const isConfigured = () =>
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME;

let _client = null;
const getClient = () => {
  if (_client) return _client;
  if (!isConfigured()) throw new Error('R2 not configured — check .env R2_* variables');
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  return _client;
};

/**
 * Upload a buffer or stream to R2.
 * @param {Buffer|ReadableStream} body   — file content
 * @param {string}               key    — object key, e.g. "stations/42/tracks/filename.mp3"
 * @param {string}               mime   — MIME type
 * @returns {Promise<string>}            — public URL
 */
const uploadToR2 = async (body, key, mime) => {
  const client = getClient();
  const upload = new Upload({
    client,
    params: {
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: mime,
    },
  });
  await upload.done();
  return `${R2_PUBLIC_URL}/${key}`;
};

/**
 * Delete an object from R2 by its key.
 */
const deleteFromR2 = async (key) => {
  const client = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
};

/**
 * Extract the R2 object key from a full public URL.
 * e.g. "https://pub-xxx.r2.dev/stations/1/tracks/foo.mp3" → "stations/1/tracks/foo.mp3"
 */
const keyFromUrl = (url) => {
  if (!url || !R2_PUBLIC_URL) return null;
  return url.replace(R2_PUBLIC_URL + '/', '');
};

module.exports = { uploadToR2, deleteFromR2, keyFromUrl, isConfigured };
