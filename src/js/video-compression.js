import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import ffmpegWorkerUrl from '@ffmpeg/ffmpeg/worker?url';
import ffmpegCoreUrl from '@ffmpeg/core?url';
import ffmpegWasmUrl from '@ffmpeg/core/wasm?url';

const TARGET_WIDTH = 1280;
const VIDEO_CRF = '28';
const VIDEO_PRESET = 'veryfast';
const FFMPEG_LOAD_TIMEOUT_MS = 300000;

let ffmpegInstance;
let ffmpegLoadPromise;

function getExtension(fileName) {
  const match = String(fileName || '').match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : 'mp4';
}

function createCompressedFileName(fileName) {
  const baseName = String(fileName || 'video')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'video';

  return `${baseName}-compactado.mp4`;
}

function timeoutAfter(ms, message) {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(message)), ms);
  });
}

function resetFFmpeg() {
  if (ffmpegInstance) {
    try {
      ffmpegInstance.terminate();
    } catch {
      // O worker pode ainda nao ter inicializado quando o carregamento expira.
    }
  }

  ffmpegInstance = undefined;
  ffmpegLoadPromise = undefined;
}

async function getFFmpeg(onStatus) {
  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpeg();
  }

  if (!ffmpegLoadPromise && !ffmpegInstance.loaded) {
    onStatus?.({ stage: 'loading', progress: 0 });

    let loadProgress = 0;
    const progressTimer = window.setInterval(() => {
      loadProgress = Math.min(95, loadProgress + 1);
      onStatus?.({ stage: 'loading', progress: loadProgress });
    }, 500);

    const loadPromise = ffmpegInstance.load({
      classWorkerURL: new URL(ffmpegWorkerUrl, window.location.href).href,
      coreURL: new URL(ffmpegCoreUrl, window.location.href).href,
      wasmURL: new URL(ffmpegWasmUrl, window.location.href).href,
    }).then(() => {
      onStatus?.({ stage: 'loading', progress: 100 });
    });

    ffmpegLoadPromise = Promise.race([
      loadPromise,
      timeoutAfter(FFMPEG_LOAD_TIMEOUT_MS, 'O compressor demorou para carregar.'),
    ]).catch((error) => {
      resetFFmpeg();
      throw error;
    }).finally(() => {
      window.clearInterval(progressTimer);
    });
  }

  await ffmpegLoadPromise;
  return ffmpegInstance;
}

async function cleanupFFmpegFiles(ffmpeg, paths) {
  await Promise.all(paths.map(async (path) => {
    try {
      await ffmpeg.deleteFile(path);
    } catch {
      // Arquivos temporarios podem nao existir se o FFmpeg falhar antes de cria-los.
    }
  }));
}

export async function compressVideoFile(file, onStatus) {
  if (!(file instanceof File) || !file.type.startsWith('video/')) {
    return { file, compressed: false, originalSize: file?.size || 0, compressedSize: file?.size || 0 };
  }

  const ffmpeg = await getFFmpeg(onStatus);
  const inputName = `input.${getExtension(file.name)}`;
  const outputName = 'output.mp4';

  const progressHandler = ({ progress }) => {
    onStatus?.({
      stage: 'compressing',
      progress: Math.max(0, Math.min(100, Math.round((progress || 0) * 100))),
    });
  };

  ffmpeg.on('progress', progressHandler);

  try {
    onStatus?.({ stage: 'compressing', progress: 1 });
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    const exitCode = await ffmpeg.exec([
      '-i', inputName,
      '-vf', `scale='min(${TARGET_WIDTH},iw)':-2`,
      '-c:v', 'libx264',
      '-preset', VIDEO_PRESET,
      '-crf', VIDEO_CRF,
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputName,
    ]);

    if (exitCode !== 0) {
      throw new Error('Falha ao comprimir o video.');
    }

    const compressedData = await ffmpeg.readFile(outputName);
    const compressedBlob = new Blob([compressedData], { type: 'video/mp4' });

    if (compressedBlob.size >= file.size) {
      return {
        file,
        compressed: false,
        originalSize: file.size,
        compressedSize: file.size,
      };
    }

    return {
      file: new File([compressedBlob], createCompressedFileName(file.name), {
        type: 'video/mp4',
        lastModified: Date.now(),
      }),
      compressed: true,
      originalSize: file.size,
      compressedSize: compressedBlob.size,
    };
  } finally {
    ffmpeg.off('progress', progressHandler);
    await cleanupFFmpegFiles(ffmpeg, [inputName, outputName]);
  }
}
