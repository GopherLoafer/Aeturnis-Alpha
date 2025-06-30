import { Request, Response, Router } from 'express';
import fs from 'fs/promises';
import path from 'path';

const router = Router();

// Get list of all reports
router.get('/list', async (req: Request, res: Response) => {
  try {
    const reportsDir = path.join(process.cwd(), 'REPORTS');
    const files = await fs.readdir(reportsDir);
    
    // Filter for markdown files and sort them
    const reports = files
      .filter(file => file.endsWith('.md'))
      .sort((a, b) => {
        // Sort by step number if present
        const aMatch = a.match(/STEP_(\d+)\.(\d+)/);
        const bMatch = b.match(/STEP_(\d+)\.(\d+)/);
        if (aMatch && bMatch) {
          const aNum = parseFloat(`${aMatch[1]}.${aMatch[2]}`);
          const bNum = parseFloat(`${bMatch[1]}.${bMatch[2]}`);
          return aNum - bNum;
        }
        return a.localeCompare(b);
      })
      .map(file => ({
        filename: file,
        name: file.replace(/_/g, ' ').replace('.md', ''),
        path: `/api/reports/view/${file}`,
        type: file.includes('STEP_') ? 'step' : file.includes('PHASE_') ? 'phase' : 'other'
      }));
    
    res.json({ reports });
  } catch (error) {
    console.error('Error reading reports:', error);
    res.status(500).json({ error: 'Failed to read reports' });
  }
});

// Get individual report content
router.get('/view/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    
    // Validate filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const filePath = path.join(process.cwd(), 'REPORTS', filename);
    const content = await fs.readFile(filePath, 'utf-8');
    
    res.json({ 
      filename,
      content,
      name: filename.replace(/_/g, ' ').replace('.md', '')
    });
  } catch (error) {
    console.error('Error reading report:', error);
    res.status(404).json({ error: 'Report not found' });
  }
});

export default router;