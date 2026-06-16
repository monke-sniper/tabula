import FileUpload from '../components/FileUpload'
import DataTable from '../components/DataTable'
import EDAPanel from '../components/EDAPanel'
import ForecastChart from '../components/ForecastChart'
import { useApp } from '../lib/context'

export default function Dashboard() {
  const { uploadData } = useApp()

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-text">Dashboard</h2>
        <p className="text-sm text-muted mt-1">Upload data, explore patterns, and run forecasts</p>
      </div>

      <FileUpload />

      {uploadData && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-muted mb-3">Data Preview</h3>
              <DataTable />
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted mb-3">Exploratory Data Analysis</h3>
              <EDAPanel />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-muted mb-3">Forecast</h3>
            <ForecastChart />
          </div>
        </>
      )}
    </div>
  )
}
