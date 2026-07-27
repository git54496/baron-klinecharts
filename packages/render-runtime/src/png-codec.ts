import { unzlibSync, zlibSync } from 'fflate';

const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const RGBA_BYTES_PER_PIXEL = 4;

export interface DecodedPng {
	readonly width: number;
	readonly height: number;
	readonly rgba: Uint8Array;
}

function readUint32(bytes: Uint8Array, offset: number): number {
	return (
		(bytes[offset] ?? 0) * 0x1000000 +
		((bytes[offset + 1] ?? 0) << 16) +
		((bytes[offset + 2] ?? 0) << 8) +
		(bytes[offset + 3] ?? 0)
	);
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
	bytes[offset] = (value >>> 24) & 0xff;
	bytes[offset + 1] = (value >>> 16) & 0xff;
	bytes[offset + 2] = (value >>> 8) & 0xff;
	bytes[offset + 3] = value & 0xff;
}

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
	const length = parts.reduce((total, part) => total + part.length, 0);
	const result = new Uint8Array(length);
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}
	return result;
}

function assertPngSignature(bytes: Uint8Array): void {
	if (
		bytes.length < PNG_SIGNATURE.length ||
		!PNG_SIGNATURE.every((value, index) => bytes[index] === value)
	) {
		throw new Error('PNG signature is invalid.');
	}
}

function paethPredictor(left: number, above: number, upperLeft: number): number {
	const prediction = left + above - upperLeft;
	const leftDistance = Math.abs(prediction - left);
	const aboveDistance = Math.abs(prediction - above);
	const upperLeftDistance = Math.abs(prediction - upperLeft);
	if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
		return left;
	}
	if (aboveDistance <= upperLeftDistance) {
		return above;
	}
	return upperLeft;
}

/** 解码 Chromium 截图使用的 8 位 RGBA、非隔行 PNG。 */
export function decodeRgbaPng(bytes: Uint8Array): DecodedPng {
	assertPngSignature(bytes);
	let cursor = PNG_SIGNATURE.length;
	let width = 0;
	let height = 0;
	let colorType = 0;
	const idatParts: Uint8Array[] = [];

	while (cursor + 12 <= bytes.length) {
		const length = readUint32(bytes, cursor);
		const typeOffset = cursor + 4;
		const dataOffset = typeOffset + 4;
		const endOffset = dataOffset + length;
		if (endOffset + 4 > bytes.length) {
			throw new Error('PNG chunk exceeds the input length.');
		}
		const type = String.fromCharCode(
			...(bytes.subarray(typeOffset, dataOffset) as Uint8Array),
		);
		const data = bytes.subarray(dataOffset, endOffset);
		if (type === 'IHDR') {
			if (
				data.length !== 13 ||
				data[8] !== 8 ||
				(data[9] !== 2 && data[9] !== 6) ||
				data[10] !== 0 ||
				data[11] !== 0 ||
				data[12] !== 0
			) {
				throw new Error('PNG must be non-interlaced 8-bit RGB or RGBA.');
			}
			width = readUint32(data, 0);
			height = readUint32(data, 4);
			colorType = data[9];
		} else if (type === 'IDAT') {
			idatParts.push(data);
		} else if (type === 'IEND') {
			break;
		}
		cursor = endOffset + 4;
	}

	if (width <= 0 || height <= 0 || idatParts.length === 0) {
		throw new Error('PNG is missing IHDR or IDAT data.');
	}

	const scanlines = unzlibSync(concatenate(idatParts));
	const sourceBytesPerPixel = colorType === 2 ? 3 : RGBA_BYTES_PER_PIXEL;
	const stride = width * sourceBytesPerPixel;
	if (scanlines.length !== height * (stride + 1)) {
		throw new Error('PNG scanline length does not match its dimensions.');
	}

	const decoded = new Uint8Array(width * height * sourceBytesPerPixel);
	for (let row = 0; row < height; row += 1) {
		const filter = scanlines[row * (stride + 1)] ?? 0;
		if (filter > 4) {
			throw new Error(`Unsupported PNG filter type: ${filter}.`);
		}
		const sourceOffset = row * (stride + 1) + 1;
		const outputOffset = row * stride;
		const previousOffset = outputOffset - stride;
		for (let column = 0; column < stride; column += 1) {
			const left =
				column >= sourceBytesPerPixel
					? (decoded[outputOffset + column - sourceBytesPerPixel] ?? 0)
					: 0;
			const above = row > 0 ? (decoded[previousOffset + column] ?? 0) : 0;
			const upperLeft =
				row > 0 && column >= sourceBytesPerPixel
					? (decoded[previousOffset + column - sourceBytesPerPixel] ?? 0)
					: 0;
			let predictor = 0;
			if (filter === 1) {
				predictor = left;
			} else if (filter === 2) {
				predictor = above;
			} else if (filter === 3) {
				predictor = Math.floor((left + above) / 2);
			} else if (filter === 4) {
				predictor = paethPredictor(left, above, upperLeft);
			}
			decoded[outputOffset + column] =
				((scanlines[sourceOffset + column] ?? 0) + predictor) & 0xff;
		}
	}

	if (colorType === 6) {
		return { width, height, rgba: decoded };
	}
	const rgba = new Uint8Array(width * height * RGBA_BYTES_PER_PIXEL);
	for (let source = 0, target = 0; source < decoded.length; source += 3, target += 4) {
		rgba[target] = decoded[source] ?? 0;
		rgba[target + 1] = decoded[source + 1] ?? 0;
		rgba[target + 2] = decoded[source + 2] ?? 0;
		rgba[target + 3] = 0xff;
	}
	return { width, height, rgba };
}

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit += 1) {
			crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type: string, data: Uint8Array): Uint8Array {
	const typeBytes = Uint8Array.from(type, (character) => character.charCodeAt(0));
	const chunk = new Uint8Array(12 + data.length);
	writeUint32(chunk, 0, data.length);
	chunk.set(typeBytes, 4);
	chunk.set(data, 8);
	writeUint32(chunk, 8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
	return chunk;
}

/** 使用固定扫描线过滤和纯 JavaScript DEFLATE 生成跨运行时一致的 PNG 字节。 */
export function encodeCanonicalRgbaPng(decoded: DecodedPng): Uint8Array {
	const { width, height, rgba } = decoded;
	if (rgba.length !== width * height * RGBA_BYTES_PER_PIXEL) {
		throw new Error('RGBA byte length does not match the PNG dimensions.');
	}

	let isOpaque = true;
	for (let offset = 3; offset < rgba.length; offset += RGBA_BYTES_PER_PIXEL) {
		if (rgba[offset] !== 0xff) {
			isOpaque = false;
			break;
		}
	}
	const outputBytesPerPixel = isOpaque ? 3 : RGBA_BYTES_PER_PIXEL;

	const header = new Uint8Array(13);
	writeUint32(header, 0, width);
	writeUint32(header, 4, height);
	header[8] = 8;
	header[9] = isOpaque ? 2 : 6;

	const stride = width * outputBytesPerPixel;
	const scanlines = new Uint8Array(height * (stride + 1));
	for (let row = 0; row < height; row += 1) {
		const targetOffset = row * (stride + 1);
		scanlines[targetOffset] = 0;
		if (isOpaque) {
			const rowStart = row * width * RGBA_BYTES_PER_PIXEL;
			for (let column = 0; column < width; column += 1) {
				const source = rowStart + column * RGBA_BYTES_PER_PIXEL;
				const target = targetOffset + 1 + column * outputBytesPerPixel;
				scanlines[target] = rgba[source] ?? 0;
				scanlines[target + 1] = rgba[source + 1] ?? 0;
				scanlines[target + 2] = rgba[source + 2] ?? 0;
			}
		} else {
			const rowStart = row * stride;
			scanlines.set(rgba.subarray(rowStart, rowStart + stride), targetOffset + 1);
		}
	}

	const compressed = zlibSync(scanlines, { level: 9, mem: 12 });
	return concatenate([
		PNG_SIGNATURE,
		createChunk('IHDR', header),
		createChunk('IDAT', compressed),
		createChunk('IEND', new Uint8Array()),
	]);
}

/** 去除浏览器平台相关的 PNG 编码差异，同时保留逐像素 RGBA 内容。 */
export function canonicalizePng(bytes: Uint8Array): Uint8Array {
	return encodeCanonicalRgbaPng(decodeRgbaPng(bytes));
}
