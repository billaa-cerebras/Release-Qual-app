
'use server';

import * as cheerio from 'cheerio';
import { z } from 'zod';

const ScrapedModelSchema = z.object({
  modelName: z.string(),
  branch: z.string(),
  owner: z.string().optional(),
  cs: z.string().optional(),
});

const ScrapeOutputSchema = z.object({
  releaseTarget: z.string().optional(),
  models: z.array(ScrapedModelSchema),
});

export type ScrapeConfluenceOutput = z.infer<typeof ScrapeOutputSchema>;

export type ConfluenceImportResult = {
  data?: {
    releaseTarget?: string;
    models: { modelName: string; branch: string; owner?: string; cs?: string; }[];
  };
  error?: string;
}

async function fetchConfluencePage(url: string, email: string, apiToken: string): Promise<{ html: string; title: string }> {
    let pageId;
    try {
        const urlObject = new URL(url);
        const pathParts = urlObject.pathname.split('/');
        const pagesIndex = pathParts.indexOf('pages');
        if (pagesIndex === -1 || pathParts.length <= pagesIndex + 1) {
            throw new Error("Could not determine Page ID from URL.");
        }
        pageId = pathParts[pagesIndex + 1];
    } catch (e: any) {
        throw new Error(`Invalid URL: ${e.message}`);
    }

    const cloudDomain = new URL(url).hostname;
    const apiEndpoint = `https://${cloudDomain}/wiki/rest/api/content/${pageId}?expand=body.view`;

    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
    
    const response = await fetch(apiEndpoint, {
        headers: {
            'Accept': 'application/json',
            'Authorization': `Basic ${auth}`
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch Confluence page: ${response.status} ${response.statusText}. Details: ${errorText}`);
    }

    const data = await response.json();
    return { html: data.body.view.value, title: data.title };
}


function parseHtmlContent(html: string): { modelName: string; branch: string; owner?: string; cs?: string; }[] {
    const $ = cheerio.load(html);

    const overviewHeader = $('h1, h2, h3').filter((i, el) => {
        return $(el).text().trim().toLowerCase().includes('overview');
    }).first();

    if (overviewHeader.length === 0) {
        throw new Error("Could not find 'Overview' section in the document.");
    }
    
    let table = overviewHeader.nextAll('table').first();
    if (table.length === 0) {
       // If not a direct sibling, search within subsequent sibling containers
       overviewHeader.nextAll().each((i, el) => {
           const foundTable = $(el).find('table').first();
           if (foundTable.length > 0) {
               table = foundTable;
               return false; // break the loop
           }
       });
    }

    if (table.length === 0) {
        throw new Error("No table found under 'Overview' section.");
    }

    const parseCell = (elem: cheerio.Element) => {
        const cell = $(elem);
        const links: { text: string; link: string }[] = [];
        cell.find('a').each((i, a) => {
            const link = $(a);
            links.push({
                text: link.text().trim(),
                link: link.attr('href') || ''
            });
        });
        const text = cell.text().trim();
        return { text, links };
    };

    const rows: { text: string; links: { text: string; link: string }[] }[][] = [];
    table.find('tr').each((i, row) => {
        const cols: { text: string; links: { text: string; link: string }[] }[] = [];
        $(row).find('th, td').each((j, cell) => {
            cols.push(parseCell(cell));
        });
        if (cols.length > 0) {
            rows.push(cols);
        }
    });

    if (rows.length < 2) {
        return [];
    }

    const headerCells = rows[0];
    const dataRows = rows.slice(1);
    
    // Sanitize headers to be valid JSON keys and create a map
    const headers = headerCells.map(h => h.text.trim().toLowerCase());

    const tableData = dataRows.map(row => {
        const rowData: { [key: string]: { text: string; links: { text: string; link: string }[] } } = {};
        headers.forEach((header, index) => {
            if (header) { // only map if header is not empty
                rowData[header] = row[index];
            }
        });
        return rowData;
    });

    const requiredHeaders = ['model', 'branch'];
    const foundHeaders = Object.keys(tableData[0] || {});
    const hasRequiredHeaders = requiredHeaders.every(h => foundHeaders.includes(h));

    if (!hasRequiredHeaders) {
        throw new Error(`Could not find 'Model' and/or 'Branch' headers in the table. Found headers: ${foundHeaders.join(', ')}.`);
    }

    return tableData.map(item => ({
        modelName: item.model?.text || "",
        branch: item.branch?.text || "",
        owner: item.owner?.text || "",
        cs: item.cs?.text || ""
    })).filter(item => item.modelName && item.branch);
}


export async function importFromConfluence(url: string): Promise<ConfluenceImportResult> {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
        return { error: 'Invalid URL provided. Please enter a valid Confluence page URL.' };
    }

    const { ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN } = process.env;

    // Mock for local dev if credentials are not set
    if (!ATLASSIAN_EMAIL || !ATLASSIAN_API_TOKEN) {
        console.warn(
            'ATLASSIAN credentials not set in .env.local. Using mock data.'
        );
        const mockData = [
            { modelName: "llama3.1-8b", branch: "inference/main", owner: "John Doe", cs: "8" },
            { modelName: "gpt-oss-120b", branch: "inference/dev", owner: "Jane Smith", cs: "16" },
            { modelName: "invalid-model", branch: "inference/dev", owner: "Jane Smith", cs: "16" }
        ];
        return { data: { models: mockData, releaseTarget: "r2542" } };
    }

    try {
        const { html, title } = await fetchConfluencePage(url, ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN);
        const models = parseHtmlContent(html);

        if (models.length === 0) {
            return { error: "No models with both a 'Model' and 'Branch' could be extracted from the 'Overview' table." };
        }
        
        let releaseTarget;
        const releaseMatch = title.match(/\d{4}/);
        if (releaseMatch) {
            releaseTarget = `r${releaseMatch[0]}`;
        }

        return { data: { models, releaseTarget } };
    } catch (error: any) {
        console.error("Error importing from Confluence:", error);
        return { error: error.message || "An unknown error occurred." };
    }
}
