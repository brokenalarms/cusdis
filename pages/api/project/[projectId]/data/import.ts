import { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import { DataService } from '../../../../../service/data.service'
import * as fs from 'fs'
import { withProjectAuth } from '../../../../../utils/auth-wrappers'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default withProjectAuth(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { session: _session, project },
) {

  const form = new formidable.IncomingForm()
  const dataService = new DataService()

  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(503)
      res.json({
        message: err.message,
      })
      return
    }

    const imported = await dataService.importFromDisqus(
      project.id,
      fs.readFileSync(files.file.path, { encoding: 'utf-8' }),
    )

    res.json({
      data: {
        pageCount: imported.threads.length,
        commentCount: imported.posts.length,
      },
    })
  })
}, ['POST'])
