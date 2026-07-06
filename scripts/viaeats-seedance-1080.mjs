import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  throw new Error("OPENROUTER_API_KEY is required.");
}

const root = process.cwd();
const outDir = path.join(root, "assets", "viaeats-ad", "video-1080p");
const model = "bytedance/seedance-2.0";

const clips = [
  {
    id: "01-opening",
    frame: "assets/viaeats-ad/frame-01-opening-1080p.jpg",
    prompt:
      "Create a 5 second vertical 1080p commercial clip from this first frame for ViaEats. Smooth cinematic push-in on the phone, ViaEats bag and food on a Lund-inspired evening street. No people, no faces, no hands, no human reflections. Keep ViaEats branding clean, no competitor names, no extra readable text, realistic motion, premium food delivery ad.",
  },
  {
    id: "02-food",
    frame: "assets/viaeats-ad/frame-02-food-1080p.jpg",
    prompt:
      "Create a 5 second vertical 1080p commercial food clip from this first frame for ViaEats. Slow appetizing camera slide across burger, sushi, pizza and bowl, subtle steam and fresh texture, ViaEats bag stays clean in background. No competitor names, no extra readable text, realistic food photography motion.",
  },
  {
    id: "03-app",
    frame: "assets/viaeats-ad/frame-03-app-1080p.jpg",
    prompt:
      "Create a 5 second vertical 1080p app-focused commercial clip from this first frame for ViaEats. Gentle handheld product shot, phone screen stays readable and premium, small motion in background, emphasize deals and points without adding random text. No competitor names, no distorted UI.",
  },
  {
    id: "04-handoff",
    frame: "assets/viaeats-ad/frame-04-handoff-1080p.jpg",
    prompt:
      "Create a 5 second vertical 1080p final CTA commercial clip from this first frame for ViaEats. Warm apartment table scene with food, phone and ViaEats bag. Subtle camera pullback and gentle food steam. No people, no faces, no hands, no human reflections. Keep the final text clean, no competitor names, no random extra text.",
  },
];

const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
const selectedClips = only ? clips.filter((clip) => clip.id === only) : clips;
if (selectedClips.length === 0) {
  throw new Error(`No clip matched --only=${only}`);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function submitClip(clip, index) {
  const framePath = path.join(root, clip.frame);
  const image = await readFile(framePath);
  const dataUrl = `data:image/jpeg;base64,${image.toString("base64")}`;

  const body = {
    model,
    prompt: clip.prompt,
    duration: 5,
    resolution: "1080p",
    size: "1080x1920",
    aspect_ratio: "9:16",
    generate_audio: false,
    seed: 240705 + index,
    frame_images: [
      {
        type: "image_url",
        image_url: { url: dataUrl },
        frame_type: "first_frame",
      },
    ],
  };

  return requestJson("https://openrouter.ai/api/v1/videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function pollJob(job) {
  let current = job;
  for (let attempt = 1; attempt <= 80; attempt += 1) {
    if (current.status === "completed") return current;
    if (["failed", "cancelled", "expired"].includes(current.status)) {
      throw new Error(`Video job ${current.id} ${current.status}: ${current.error ?? "no error detail"}`);
    }

    console.log(`[${job.id}] ${current.status}; poll ${attempt}/80`);
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    const pollingUrl = new URL(current.polling_url, "https://openrouter.ai");
    current = await requestJson(pollingUrl);
  }
  throw new Error(`Video job ${job.id} did not complete in time.`);
}

async function downloadJob(job, clip) {
  const url = job.unsigned_urls?.[0] ?? `https://openrouter.ai/api/v1/videos/${job.id}/content?index=0`;
  const response = await fetch(url, {
    headers: url.startsWith("https://openrouter.ai/api/") ? { Authorization: `Bearer ${apiKey}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }
  const outputPath = path.join(outDir, `${clip.id}.mp4`);
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  return outputPath;
}

await mkdir(outDir, { recursive: true });

for (const [index, clip] of selectedClips.entries()) {
  console.log(`Submitting ${clip.id}`);
  const submitted = await submitClip(clip, index);
  console.log(JSON.stringify(submitted, null, 2));
  const completed = await pollJob(submitted);
  const outputPath = await downloadJob(completed, clip);
  console.log(`Saved ${outputPath}`);
}
