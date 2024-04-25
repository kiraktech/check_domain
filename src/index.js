// const { GoogleSpreadsheet } = require("google-spreadsheet");
const puppeteer = require('puppeteer')
// const Cnf = require("../config.json");
// const creds = require("../cred.json");
// const JWT = require('google-auth-library');
const fs = require('fs-extra')
const xlsx = require('xlsx');
const path = require('path')
const nodemailer = require('nodemailer');
require('dotenv').config()
const { v4: uuidv4 } = require('uuid');

const timestamp = Date.now();

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

// Queue to store form submissions
const formQueue = [];

// Function to process the next form in the queue
const processNextForm = () => {
  if (formQueue.length > 0) {
    const nextForm = formQueue.shift();
    nextForm();
  }
};

/**
 * The function `handleDataWithFile` reads and merges table data into a JSON file if it exists,
 * otherwise creates a new file with the data.
 * @param tableData - The `tableData` parameter in the `handleDataWithFile` function is the data that
 * you want to save or append to a JSON file. It could be an object, an array, or any structured data
 * that you want to store persistently in a file named `tableData.json`. The
 */
const handleDataWithFile = (tableData, tableDataFilePath) => {
  // Kiểm tra file tồn tại
  if (fs.existsSync(tableDataFilePath)) {
    // Đọc dữ liệu cũ
    const oldData = JSON.parse(fs.readFileSync(tableDataFilePath, 'utf-8'));
    // Gộp dữ liệu mới vào dữ liệu cũ
    const newData = oldData.concat({ ...tableData });
    // Lưu gộp dữ liệu vào file
    fs.writeFileSync(tableDataFilePath, JSON.stringify(newData, null, 2), 'utf-8');
  } else {
    // Nếu file không tồn tại, tạo mới với dữ liệu mới
    fs.writeFileSync(tableDataFilePath, JSON.stringify({ ...tableData }, null, 2), 'utf-8');
  }
}

async function crawl(page, url, tableDataFilePath) {
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

  handleDataWithFile(tableData, tableDataFilePath);

  return tableData
};

const exportFile = (exportfileName, tableDataFilePath) => {
  return new Promise((resolve, reject) => {
    fs.readFile(tableDataFilePath, 'utf8', (err, data) => {
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
        xlsx.utils.book_append_sheet(wb, ws, exportfileName);

        const exportedDirectory = path.join(__dirname, '..', 'exported');

        if (!fs.existsSync(exportedDirectory)) {
          fs.mkdirSync(exportedDirectory, { recursive: true });
        }

        // Construct the full file path
        const filePath = path.join(__dirname, '..', 'exported', `${exportfileName}.xlsx`);

        // Write the workbook to a file
        xlsx.writeFile(wb, filePath, { bookType: 'xlsx' });

        console.log("Excel file generated successfully:", filePath);
        resolve({ filePath, tableDataFilePath });
      } catch (parseError) {
        console.error("Error parsing JSON:", parseError);
        reject(parseError);
      }
    });
  });
}

const sendMail = (recipientEmail, exportfileName, filePath, tableDataFilePath) => {
  try {

    let transporter = nodemailer.createTransport({
      service: 'Gmail', // Use your email service provider
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.SENDER_EMAIL, // Your email address
        pass: process.env.SENDER_PASSWORD // Your password
      }
    });

    const exportedDirectory = path.join(__dirname, '..', 'exported');

    if (!fs.existsSync(exportedDirectory)) {
      fs.mkdirSync(exportedDirectory, { recursive: true });
    }

    // Specify the path to your file here
    const fileName = `${exportfileName}.xlsx`; // Specify the name of the file here


    if (fs.existsSync(filePath)) {
      // Read the file content
      const fileContent = fs.readFileSync(filePath);

      // Define email options
      let mailOptions = {
        from: process.env.SENDER_EMAIL, // Sender address
        to: recipientEmail, // List of recipients
        subject: 'File Attachment', // Subject line
        text: 'Please find the attached file.', // Plain text body
        attachments: [
          {
            filename: fileName,
            content: fileContent
          }
        ]
      };

      // Send email
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('Error occurred:', error);
        } else {
          console.log('Email sent:', info.response);

          // Delete the file after sending the email
          fs.unlink(filePath, (unlinkError) => {
            if (unlinkError) {
              console.error('Error deleting file:', unlinkError);
            } else {
              console.log('File deleted successfully:', filePath);
            }
          });

          fs.unlink(tableDataFilePath, (unlinkError) => {
            if (unlinkError) {
              console.error('Error deleting file:', unlinkError);
            } else {
              console.log('File deleted successfully:', filePath);
            }
          });
        }
      });
    }
  } catch (err) {
    console.log(err)
  }
}

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

  const tableDataDirectory = path.join(__dirname, '..', 'tableData'); // Get the full path to the directory
  const tableDataFilePath = path.join(tableDataDirectory, 'tableData.json');

  // Create the directory if it doesn't exist
  if (!fs.existsSync(tableDataDirectory)) {
    fs.mkdirSync(tableDataDirectory, { recursive: true });
  }

  fs.writeFileSync(tableDataFilePath, '[]');

  for (const domain of domains) {
    const data = await crawl(page, domain, tableDataFilePath);
    results.push(data);
  }

  await browser.close();

  const exportfileName = `exported_data`
  exportFile(exportfileName, tableDataFilePath);

  return results
}

const getDataBySheet = async (sheet, handleDeleteUploadedFile) => {
  console.time("getDataBySheet")
  const domains = sheet.map((item) => Object.values(item)[0])
  const batchCount = Math.ceil(domains.length / 10);
  const batches = [];

  // Divide URLs into batches of 10
  for (let i = 0; i < batchCount; i++) {
    batches.push(domains.slice(i * 10, (i + 1) * 10));
  }

  const results = []

  const browser = await puppeteer.launch(puppeteerOptions);
  const page = await browser.newPage();

  // Navigate the page to a URL
  await page.goto('https://tracuutenmien.gov.vn/tra-cuu-thong-tin-ten-mien');

  // Set screen size
  await page.setViewport({ width: 1080, height: 1024 });

  const tableDataDirectory = path.join(__dirname, '..', 'tableData'); // Get the full path to the directory
  const tableDataFilePath = path.join(tableDataDirectory, 'tableData.json');

  // Create the directory if it doesn't exist
  if (!fs.existsSync(tableDataDirectory)) {
    fs.mkdirSync(tableDataDirectory, { recursive: true });
  }

  fs.writeFileSync(tableDataFilePath, '[]');

  for (let i = 0; i < batches.length; i++) {
    for (const domain of batches[i]) {
      const data = await crawl(page, domain, tableDataFilePath);

      results.push(data);
    }
  }

  await browser.close();

  console.timeEnd("getDataBySheet")

  const exportfileName = `exported_data`
  exportFile(exportfileName, tableDataFilePath)
    .then(() => handleDeleteUploadedFile())
    .catch(error => console.error('Error:', error));

  return results
}

const getDataByInputEmail = async (domainInput, recipientEmail) => {
  formQueue.push(async () => {
    const domains = splitUrls(domainInput)

    const browser = await puppeteer.launch(puppeteerOptions);
    const page = await browser.newPage();

    // Navigate the page to a URL
    await page.goto('https://tracuutenmien.gov.vn/tra-cuu-thong-tin-ten-mien');

    const uniqueId = uuidv4();

    const tableDataDirectory = path.join(__dirname, '..', 'tableData'); // Get the full path to the directory
    const tableDataFilePath = path.join(tableDataDirectory, `tableData_${timestamp}_${uniqueId}.json`.substring(0, 31));

    // Create the directory if it doesn't exist
    if (!fs.existsSync(tableDataDirectory)) {
      fs.mkdirSync(tableDataDirectory, { recursive: true });
    }

    fs.writeFileSync(tableDataFilePath, '[]');

    for (const domain of domains) {
      await crawl(page, domain, tableDataFilePath);
    }

    await browser.close();

    const exportfileName = `exported_data_${timestamp}_${uniqueId}`.substring(0, 31);

    exportFile(exportfileName, tableDataFilePath)
      .then(({ filePath, tableDataFilePath }) => sendMail(recipientEmail, exportfileName, filePath, tableDataFilePath))
      .catch(error => console.error('Error:', error));

    processNextForm();
  })

  if (formQueue.length === 1) {
    processNextForm();
  }
}

const getDataBySheetEmail = async (sheet, recipientEmail, handleDeleteUploadedFile) => {
  formQueue.push(async () => {
    const domains = sheet.map((item) => Object.values(item)[0])
    const batchCount = Math.ceil(domains.length / 10);
    const batches = [];

    // Divide URLs into batches of 10
    for (let i = 0; i < batchCount; i++) {
      batches.push(domains.slice(i * 10, (i + 1) * 10));
    }

    const browser = await puppeteer.launch(puppeteerOptions);
    const page = await browser.newPage();

    // Navigate the page to a URL
    await page.goto('https://tracuutenmien.gov.vn/tra-cuu-thong-tin-ten-mien');

    // Set screen size
    await page.setViewport({ width: 1080, height: 1024 });

    const uniqueId = uuidv4();

    const tableDataDirectory = path.join(__dirname, '..', 'tableData'); // Get the full path to the directory
    const tableDataFilePath = path.join(tableDataDirectory, `tableData_${timestamp}_${uniqueId}.json`.substring(0, 31));

    // Create the directory if it doesn't exist
    if (!fs.existsSync(tableDataDirectory)) {
      fs.mkdirSync(tableDataDirectory, { recursive: true });
    }

    fs.writeFileSync(tableDataFilePath, '[]');

    for (let i = 0; i < batches.length; i++) {
      for (const domain of batches[i]) {
        await crawl(page, domain, tableDataFilePath);
      }
    }

    await browser.close();

    const exportfileName = `exported_data_${timestamp}_${uniqueId}`.substring(0, 31);

    exportFile(exportfileName, tableDataFilePath)
      .then(({ filePath, tableDataFilePath }) => sendMail(recipientEmail, exportfileName, filePath, tableDataFilePath))
      .then(() => handleDeleteUploadedFile())
      .catch(error => console.error('Error:', error));

    processNextForm();
  })

  if (formQueue.length === 1) {
    processNextForm();
  }
}

module.exports = { getDataByInput, fetch, getDataBySheet, getDataByInputEmail, getDataBySheetEmail }
