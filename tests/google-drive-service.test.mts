import test from "node:test";
import assert from "node:assert/strict";
import { cleanFolderPath, MAX_DRIVE_FILE_BYTES, validateMediaUpload } from "../lib/google-drive/service.ts";

test("Google Drive upload validation keeps media inside clean album paths", () => {
  assert.equal(cleanFolderPath(" / Campaign \\ Opening / Reels / "), "Campaign/Opening/Reels");
  assert.equal(validateMediaUpload(" footage final.mp4 ", "video/mp4", 1024), "footage final.mp4");
  assert.throws(() => cleanFolderPath("../Reels"), /tidak valid/i);
  assert.throws(() => validateMediaUpload("script.exe", "application/octet-stream", 100), /gambar, video, atau audio/i);
  assert.throws(() => validateMediaUpload("large.mov", "video/quicktime", MAX_DRIVE_FILE_BYTES + 1), /maksimal 50 GB/i);
});
