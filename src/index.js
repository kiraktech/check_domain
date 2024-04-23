// const { GoogleSpreadsheet } = require("google-spreadsheet");
const puppeteer = require('puppeteer')
// const Cnf = require("../config.json");
// const creds = require("../cred.json");
// const JWT = require('google-auth-library');
const fs = require('fs-extra')
const xlsx = require('xlsx');

const puppeteerOptions = {
  headless: true,
  args: [
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-setuid-sandbox',
    '--no-first-run',
    '--no-sandbox',
    '--no-zygote',
    '--deterministic-fetch',
    '--disable-features=IsolateOrigins',
    '--disable-site-isolation-trials',
    // '--single-process',
  ],
}

// const serviceAccountAuth = new JWT.JWT({
//   email: creds.client_email,
//   key: creds.private_key,
//   scopes: [
//     'https://www.googleapis.com/auth/spreadsheets',
//   ],
// });

// loadDoc = async () => {
//   console.log("Loading data from google sheet: START");
//   const doc = new GoogleSpreadsheet(Cnf.google_sheet_id, serviceAccountAuth);
//   // const doc = new GoogleSpreadsheet(Cnf.google_sheet_id);
//   // await doc.useServiceAccountAuth(creds);
//   await doc.loadInfo();
//   defaultSheet = doc.sheetsByIndex[parseInt(Cnf.google_sheet_index)];
//   await defaultSheet.loadCells();
//   const lines = await defaultSheet.getRows();
//   console.log("Loading data from google sheet: DONE");
//   return lines;
// };

const handleDataWithFile = (tableData) => {
  const filePath = 'tableData.json';

  // Kiểm tra file tồn tại
  if (fs.existsSync(filePath)) {
    // Đọc dữ liệu cũ
    const oldData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    // Gộp dữ liệu mới vào dữ liệu cũ
    const newData = oldData.concat({ ...tableData });
    // Lưu gộp dữ liệu vào file
    fs.writeFileSync(filePath, JSON.stringify(newData, null, 2), 'utf-8');
  } else {
    // Nếu file không tồn tại, tạo mới với dữ liệu mới
    fs.writeFileSync(filePath, JSON.stringify({ ...tableData }, null, 2), 'utf-8');
  }
}

const showDataOnPage = () => {
  document.addEventListener('DOMContentLoaded', function () {
    fetch('tableData.json')
      .then(response => response.json())
      .then(dataArray => {
        const container = document.getElementById('tables-container');

        dataArray.forEach((tableData, index) => {
          // Tạo bảng và các phần tử liên quan
          const table = document.createElement('table');
          const thead = document.createElement('thead');
          const tbody = document.createElement('tbody');
          const trHead = document.createElement('tr');

          // Giả sử cột đầu tiên là tiêu đề
          if (tableData.length > 0) {
            tableData[0].forEach(header => {
              const th = document.createElement('th');
              th.textContent = header;
              trHead.appendChild(th);
            });
            thead.appendChild(trHead);
            table.appendChild(thead);
          }

          // Thêm dữ liệu vào từng hàng
          tableData.slice(1).forEach(rowData => {
            const tr = document.createElement('tr');
            rowData.forEach(cellData => {
              const td = document.createElement('td');
              td.textContent = cellData;
              tr.appendChild(td);
            });
            tbody.appendChild(tr);
          });

          table.appendChild(tbody);
          container.appendChild(table);

          // Tùy chọn: Thêm một khoảng cách hoặc phân cách giữa các bảng
          if (index < dataArray.length - 1) {
            const divider = document.createElement('div');
            divider.style.margin = '20px 0';
            container.appendChild(divider);
          }
        });
      })
      .catch(error => console.error('Error loading table data:', error));
  });
}

async function crawl(page, url) {
  if (!url) return { url: '', data: [] }
  // Launch the browser and open a new blank page

  await page.waitForSelector('body')

  // Type into search box
  await page.type('#header-search__search-bar .input-group input', url);

  // Wait and click on first result
  const searchResultSelector = '.input-group-append button';
  await page.waitForSelector(searchResultSelector);
  await Promise.all([
    await page.click(searchResultSelector),
    await page.waitForNavigation(),
  ])

  // Locate the full title with a unique string
  await page.waitForSelector('.card-body')

  const tableData = await page.evaluate((pageUrl) => {
    const rows = document.querySelectorAll('.card-body table tr'); // Chọn tất cả các hàng trong bảng
    return {
      url: pageUrl, data: Array.from(rows, row => {
        // const columns = row.querySelectorAll('td'); // Chọn tất cả các ô dữ liệu trong hàng
        // return Array.from(columns, column => column.innerText); // Trả về văn bản của mỗi ô

        const column = row.querySelector('td:last-child'); // Chọn tất cả các ô dữ liệu trong hàng
        return column.innerText; // Trả về văn bản của mỗi ô
      })
    };
  }, url);
  console.log(tableData.url)
  console.table(tableData.data)

  handleDataWithFile(tableData);

  // showDataOnPage(tableData)


  return tableData
};

const exportFile = () => {
  fs.readFile('tableData.json', 'utf8', (err, data) => {
    if (err) {
      console.error("Error reading JSON file:", err);
      return;
    }

    try {
      const jsonData = JSON.parse(data);

      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.aoa_to_sheet([]);

      // Add headers
      xlsx.utils.sheet_add_aoa(ws, [
        ['Domain', 'Loại tên miền', 'Tên chủ thể đăng ký sử dụng', 'Nhà đăng ký quản lý', 'Ngày đăng ký', 'Ngày hết hạn']
      ]);

      const columnWidths = [
        { wch: 30 }, // Domain
        { wch: 30 }, // Loại tên miền
        { wch: 30 }, // Tên chủ thể đăng ký sử dụng
        { wch: 30 }, // Nhà đăng ký quản lý
        { wch: 30 },  // Ngày đăng ký
        { wch: 30 }  // Ngày hết hạn
      ];
      ws['!cols'] = columnWidths;

      // Add data to worksheet
      jsonData.forEach((item, index) => {
        const row = [item.url, ...item.data];
        xlsx.utils.sheet_add_aoa(ws, [row], { origin: -1 });
      });

      // Add worksheet to workbook
      xlsx.utils.book_append_sheet(wb, ws, 'exported_data');

      // Define the file name
      const fileName = "exported_data.xlsx";

      // Write the workbook to a file
      xlsx.writeFile(wb, fileName, { bookType: 'xlsx' });

      console.log("Excel file generated successfully:", fileName);
    } catch (parseError) {
      console.error("Error parsing JSON:", parseError);
    }
  });
}

// crawl()

// const fetch = async () => {
//   const [data] = loadDoc();
//   console.log("🚀 ~ fetch ~ data:", data)
//   let result = []

//   result = data.map(async (el) =>
//     await crawl(el._rawData[0])
//   );

//   return result
// }

function splitUrls(text) {
  // This regex matches spaces (including tabs and spaces) and endline characters
  const regex = /\s+/;
  // Split the text by the regex and filter out any empty strings in case there are multiple spaces
  return text.split(regex).filter(url => url.length > 0);
}

const getDataByInput = async (domainInput) => {
  const domains = splitUrls(domainInput)

  const results = []

  const browser = await puppeteer.launch(puppeteerOptions);
  const page = await browser.newPage();

  // Navigate the page to a URL
  await page.goto('https://tracuutenmien.gov.vn/tra-cuu-thong-tin-ten-mien');

  fs.writeFileSync('tableData.json', '[]')

  for (const domain of domains) {
    const data = await crawl(page, domain);
    results.push(data);
  }

  await browser.close();

  exportFile();

  return results
}

const getDataBySheet = async (sheet, startIndex) => {
  console.time("getDataBySheet")
  const domains = sheet.map((item) => Object.values(item)[0])
  const batchCount = Math.ceil(domains.length / 10);
  const batches = [];

  // Divide URLs into batches of 10
  for (let i = 0; i < batchCount; i++) {
    batches.push(domains.slice(i * 10, (i + 1) * 10));
  }

  // batches.push(domains.slice(startIndex, startIndex + 10));

  const results = []

  const browser = await puppeteer.launch(puppeteerOptions);
  const page = await browser.newPage();

  // Navigate the page to a URL
  await page.goto('https://tracuutenmien.gov.vn/tra-cuu-thong-tin-ten-mien');

  // Set screen size
  await page.setViewport({ width: 1080, height: 1024 });

  fs.writeFileSync('tableData.json', '[]')

  for (let i = 0; i < batches.length; i++) {
    for (const domain of batches[i]) {
      const data = await crawl(page, domain);

      results.push(data);
    }
  }

  await browser.close();

  console.timeEnd("getDataBySheet")

  exportFile();

  return results
}

module.exports = { getDataByInput, fetch, getDataBySheet }
