import { NextResponse } from 'next/server'
import { join } from 'path'
import { existsSync } from 'fs'
import { Readable } from 'stream'

const EXTENSION_DIR = '/Users/aaryangupta/Desktop/workstack-extension'

export async function GET() {
  try {
    const { readFile, readdir } = await import('fs/promises')
    const archiver = await import('archiver')

    // Create a ZIP stream
    const archive = archiver.create('zip', { zlib: { level: 9 } })

    // Create a readable stream from the archive
    const stream = Readable.from(archive as unknown as NodeJS.ReadableStream)

    // Collect chunks to create a Buffer
    const chunks: Uint8Array[] = []
    const zipPromise = new Promise<Uint8Array>((resolve, reject) => {
      archive.on('error', reject)
      archive.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks.map(c => Buffer.from(c))))))

      stream.on('data', (chunk: Buffer) => chunks.push(new Uint8Array(chunk)))
    })

    // Add files to the ZIP
    const filesToAdd = [
      'manifest.json',
      'background.js',
      'content.js',
      'popup.html',
      'popup.js',
      'styles.css',
      'README.md',
    ]

    // Add main files
    for (const file of filesToAdd) {
      const filePath = join(EXTENSION_DIR, file)
      if (existsSync(filePath)) {
        const content = await readFile(filePath)
        archive.append(content, { name: file })
      }
    }

    // Add icons
    const iconsDir = join(EXTENSION_DIR, 'icons')
    if (existsSync(iconsDir)) {
      const iconFiles = await readdir(iconsDir)
      for (const iconFile of iconFiles) {
        const filePath = join(iconsDir, iconFile)
        const content = await readFile(filePath)
        archive.append(content, { name: `icons/${iconFile}` })
      }
    }

    // Finalize the archive
    archive.finalize()

    // Wait for ZIP to be created
    const zipBuffer = await zipPromise

    // Return the ZIP file
    return new NextResponse(Buffer.from(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="workstack-extension.zip"',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Error creating extension ZIP:', error)
    return NextResponse.json(
      { error: 'Failed to create extension package', details: String(error) },
      { status: 500 }
    )
  }
}
