import { Controller, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs';
import * as path from 'path';

@Controller('files')
export class FilesController {
  @Post('upload')
  @UseInterceptors(AnyFilesInterceptor())
  async upload(@UploadedFiles() files: any[]) {
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const urls = [] as any[];
    for (const f of (files || [])) {
      let filename = f.filename;

      // If multer used memoryStorage, there may be no filename but buffer exists — write it to uploads
      if (!filename) {
        const ext = path.extname(f.originalname || '') || '';
        filename = `${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`;
        const dest = path.join(uploadsDir, filename);
        try {
          if (f.buffer) {
            fs.writeFileSync(dest, f.buffer);
          } else if (f.path) {
            // if multer stored a temp file, copy it to uploads
            fs.copyFileSync(f.path, dest);
          }
        } catch (e) {
          console.error('Failed to save uploaded file to disk', e);
        }
      } else {
        // ensure file exists in uploads dir; if multer stored elsewhere, try to copy
        const candidatePath = f.path || path.join(uploadsDir, filename);
        if (f.path && !fs.existsSync(path.join(uploadsDir, filename))) {
          try {
            fs.copyFileSync(f.path, path.join(uploadsDir, filename));
          } catch (e) {
            
          }
        }
      }

      const url = `/uploads/${filename}`;
      urls.push({ url, originalName: f.originalname, size: f.size, mime: f.mimetype });
    }

    return { files: urls };
  }
}
