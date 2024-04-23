const express = require('express');
const bodyParser = require("body-parser");
const path = require('path')
const xlsx = require('xlsx');
const multer = require('multer')
const upload = multer({ dest: 'uploads/' })

var app = express();
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: false }))
app.set("views", path.join(__dirname, "views"));
app.set('view engine', 'ejs');
var port = process.env.PORT || 3000;

app.get("/", async function (req, res) {
  res.render("home");
});

app.post('/search-by-input', async (req, res) => {
  console.log('req.body', req.body)

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

    const dataList = await getDataBySheet(columnData)

    res.render("result", { dataList })
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error processing the file.');
  }
})

// app.get('/result', (req, res) => {
//   const page = parseInt(req.query.page) || 1;
//   const perPage = 10;
//   const startIndex = (page - 1) * perPage;
//   const endIndex = page * perPage;

//   res.render('result', { 
//       data: crawledData, 
//       startIndex, 
//       endIndex,
//       currentPage: page
//   });
// });

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})