const express = require('express');
const bodyParser = require("body-parser");
const path = require('path')
const xlsx = require('xlsx');
const multer = require('multer')
const upload = multer({ dest: 'uploads/' })
const fs = require('fs-extra')
require('dotenv').config()

var app = express();
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: false }))
app.set("views", path.join(__dirname, "views"));
app.set('view engine', 'ejs');
var port = process.env.PORT || 3009;

app.get("/", async function (req, res) {
  res.render("home");
});

app.post('/search-by-input', async (req, res) => {
  const domainInput = req.body.domain

  const { getDataByInput } = require('./src/index')

  const dataList = await getDataByInput(domainInput)

  // res.send('POST request to homepage')
  res.render("result", { dataList })
})

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No files were uploaded.');
  }

  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const columnData = xlsx.utils.sheet_to_json(sheet);

    const { getDataBySheet } = require('./src/index')

    const dataList = await getDataBySheet(columnData, () => {
      fs.unlink(req.file.path, (err) => {
        if (err) {
          console.error('Error deleting file:', err);
        } else {
          console.log('File deleted successfully:', req.file.path);
        }
      });
    })

    res.render("result", { dataList })
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error processing the file.');
  }
})

app.get('/download', (req, res) => {
  const filePath = './exported/exported_data.xlsx'; // Specify the path to your file here
  const fileName = 'exported_data.xlsx'; // Specify the name of the file here

  const fileStream = fs.createReadStream(filePath);
  fileStream.on('error', (err) => {
    res.status(404).send('File not found');
  });

  res.setHeader('Content-disposition', 'attachment; filename=' + fileName);
  res.setHeader('Content-type', 'text/plain'); // Set the appropriate content type

  fileStream.pipe(res);
})

app.post('/search-by-input-email', async (req, res) => {
  res.render("result-email")

  const domainInput = req.body.domain

  const { getDataByInputEmail } = require('./src/index')

  await getDataByInputEmail(domainInput, req.body.email)
})

app.post('/upload-email', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No files were uploaded.');
  }

  try {
    res.render("result-email")

    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const columnData = xlsx.utils.sheet_to_json(sheet);

    const { getDataBySheetEmail } = require('./src/index')

    await getDataBySheetEmail(columnData, req.body.email, () => {
      fs.unlink(req.file.path, (err) => {
        if (err) {
          console.error('Error deleting file:', err);
        } else {
          console.log('File deleted successfully:', req.file.path);
        }
      });
    })

  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error processing the file.');
  }
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
