const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ⚠️ كلمة السر للدخول للوحة التحكم
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "abod2026";

// 🕵️ المسار السري الخاص بلوحة التحكم
const ADMIN_PATH = process.env.ADMIN_PATH || "abod-master-7788";

const DB_FILE = path.join(__dirname, 'database.json');

// 👑 الأكواد المدمجة تلقائياً لضمان عدم ضياع أي كود لأخوياك نهائياً
const INITIAL_KEYS = [{"key":"YS-0OXS-FN9A","created_at":"2026-09-04T08:07:38.294Z","activations":[{"device_id":"EE56E7F2-ECFF-45C8-8804-18CD0B720763","device_name":"iPhone 12 Pro Max","device_model":"iPhone13,4","ios_version":"15.0.1","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-04T08:07:59.206Z","approved_at":"2026-09-04T08:07:59.206Z","last_seen":"2026-09-04T08:52:16.771Z"}]},{"key":"YS-T33Q-PBF7","created_at":"2026-09-03T19:12:06.896Z","activations":[{"device_id":"F02BC697-3EF8-47CE-A3DD-F1B355968A12","device_name":"‏iPhone ‏Hadi (2)","device_model":"iPhone11,2","ios_version":"15.5","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T19:12:28.201Z","approved_at":"2026-09-03T19:12:28.201Z","last_seen":"2026-09-03T19:12:28.201Z"}]},{"key":"YS-11UM-YU4W","created_at":"2026-09-03T17:37:05.633Z","activations":[{"device_id":"1824F613-9999-CC9F-A7C3-BCEA5D127300","device_name":"iPad","device_model":"iPad15,7","ios_version":"26.5.2","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T18:37:31.343Z","approved_at":"2026-09-03T18:37:31.343Z","last_seen":"2026-09-04T03:17:08.458Z"}]},{"key":"YS-J4UK-H8B8","created_at":"2026-09-03T17:13:56.095Z","activations":[{"device_id":"21F45349-AE1F-0E9B-9B50-78AFF5A3B9D8","device_name":"iPhone","device_model":"iPhone12,1","ios_version":"14.8","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T17:14:29.221Z","approved_at":"2026-09-03T17:14:29.221Z","last_seen":"2026-09-04T03:15:37.774Z"}]},{"key":"YS-9XMM-XLZ2","created_at":"2026-09-03T17:08:49.097Z","activations":[{"device_id":"053534AE-6992-6B50-D388-243FF8E9567F","device_name":"iPhone","device_model":"iPhone12,3","ios_version":"14.7.1","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T17:09:39.176Z","approved_at":"2026-09-03T17:09:39.176Z","last_seen":"2026-09-03T17:14:11.05Z"}]},{"key":"YS-M7OV-LEMO","created_at":"2026-09-03T17:08:30.837Z","activations":[{"device_id":"3A3C3377-E8D9-4CC9-A08D-48561691AC85","device_name":"iPhone","device_model":"iPhone13,2","ios_version":"16.1.1","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T17:27:25.865Z","approved_at":"2026-09-03T17:27:25.865Z","last_seen":"2026-09-04T02:21:06.786Z"}]},{"key":"YS-LRQ1-SVNM","created_at":"2026-09-03T17:06:31.725Z","activations":[{"device_id":"D02D5667-4BCA-41CD-833E-D950F3DC7A92","device_name":"iPhone","device_model":"iPhone11,6","ios_version":"16.0","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T17:15:05.257Z","approved_at":"2026-09-03T17:15:05.257Z","last_seen":"2026-09-03T21:22:20.151Z"}]},{"key":"YS-AXNX-5JHH","created_at":"2026-09-03T17:03:00.08Z","activations":[{"device_id":"987D4691-B442-4731-9A69-A664DA8EFB03","device_name":"iPhone","device_model":"iPhone12,1","ios_version":"26.5.2","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T17:20:35.565Z","approved_at":"2026-09-03T17:20:35.565Z","last_seen":"2026-09-03T21:18:53.496Z"}]},{"key":"YS-UK3N-9X61","created_at":"2026-09-03T16:48:41.182Z","activations":[{"device_id":"819729DD-96D9-A18D-9ACE-2266434D82F2","device_name":"iPhone DDD","device_model":"iPhone13,2","ios_version":"14.3","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T16:50:47.285Z","approved_at":"2026-09-03T16:50:47.285Z","last_seen":"2026-09-03T21:51:00.605Z"}]},{"key":"YS-JRSG-H5S2","created_at":"2026-09-03T15:59:58.396Z","activations":[{"device_id":"EA1EDFED-26A8-4DC9-8AB4-33CA844F65EC","device_name":"iPhone","device_model":"iPhone14,5","ios_version":"18.5","bundle_id":"com.yalla.yallalite6","status":"approved","requested_at":"2026-09-03T16:02:56.098Z","approved_at":"2026-09-03T16:02:56.098Z","last_seen":"2026-09-03T16:03:59.506Z"}]},{"key":"YS-4ON7-23UW","created_at":"2026-09-03T15:50:07.374Z","activations":[{"device_id":"21F45349-AE1F-0E9B-9B50-78AFF5A3B9D8","device_name":"iPhone","device_model":"iPhone12,1","ios_version":"14.6","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T15:50:37.43Z","approved_at":"2026-09-03T15:50:37.43Z","last_seen":"2026-09-04T11:28:56.397Z"}]},{"key":"YS-IVN7-D3RA","created_at":"2026-09-03T15:23:56.936Z","activations":[{"device_id":"65DC2EB0-E9F1-BB17-ACA9-DC54E37EC0F3","device_name":"iPhone","device_model":"iPhone13,1","ios_version":"14.1","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T15:24:36.249Z","approved_at":"2026-09-03T15:24:36.249Z","last_seen":"2026-09-03T21:19:25.928Z"}]},{"key":"YS-8CKT-2LQW","created_at":"2026-09-03T15:18:25.212Z","activations":[{"device_id":"E93FE204-AEAF-962B-8398-DB772CE994B8","device_name":"iPhone","device_model":"iPhone12,1","ios_version":"17.5.1","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T15:19:35.758Z","approved_at":"2026-09-03T15:19:35.758Z","last_seen":"2026-09-03T21:19:40.341Z"}]},{"key":"YS-9YZQ-H3OZ","created_at":"2026-09-03T14:53:29.206Z","activations":[{"device_id":"5FCE23A3-CD0D-437E-A615-87011EA2C4E2","device_name":"iPhone","device_model":"iPhone18,2","ios_version":"26.0","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T14:54:03.115Z","approved_at":"2026-09-03T14:54:03.115Z","last_seen":"2026-09-03T14:55:20.726Z"}]},{"key":"YS-Y3XR-Q8HU","created_at":"2026-09-03T13:53:20.562Z","activations":[{"device_id":"34E3EF8C-2B27-4B48-9425-B0FBA45BECFF","device_name":"M'iPhoneSx","device_model":"iPhone11,6","ios_version":"14.3","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T13:53:41.566Z","approved_at":"2026-09-03T13:53:41.566Z","last_seen":"2026-09-04T08:09:14.041Z"}]},{"key":"YS-2IHR-Z246","created_at":"2026-09-03T13:45:22.916Z","activations":[{"device_id":"39E1DAD6-3942-4203-9129-C68136558FBA","device_name":"iPhone","device_model":"iPhone17,4","ios_version":"18.6.2","bundle_id":"com.yalla.yallalite4","status":"approved","requested_at":"2026-09-03T13:47:41.305Z","approved_at":"2026-09-03T13:47:41.305Z","last_seen":"2026-09-03T14:09:49.798Z"}]},{"key":"YS-N6N5-5E96","created_at":"2026-09-03T13:43:23.253Z","activations":[{"device_id":"16A73555-5BFD-4455-84FA-6A223AED6E8E","device_name":"‏iPhone ‏Ssjval","device_model":"iPhone9,3","ios_version":"15.8.4","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T16:53:07.081Z","approved_at":"2026-09-03T16:53:07.081Z","last_seen":"2026-09-03T16:53:07.081Z"}]},{"key":"YS-1KKZ-MUH6","created_at":"2026-09-03T13:42:59.591Z","activations":[{"device_id":"E4E5DE29-A2A7-4416-97A4-883B07908082","device_name":"iPad","device_model":"iPad13,18","ios_version":"17.5.1","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T13:44:29.863Z","approved_at":"2026-09-03T13:44:29.863Z","last_seen":"2026-09-03T13:44:29.863Z"}]},{"key":"YS-SCQ8-H41T","created_at":"2026-09-03T12:53:16.264Z","activations":[{"device_id":"D32CB0F3-F0B0-49CA-A0C0-84195334A8E0","device_name":"iPhone","device_model":"iPhone15,3","ios_version":"16.6","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T12:53:43.998Z","approved_at":"2026-09-03T12:53:43.998Z","last_seen":"2026-09-03T12:53:43.998Z"}]},{"key":"YS-Z2QM-SEZ9","created_at":"2026-09-03T12:31:31.161Z","activations":[{"device_id":"238688B2-668F-43CF-B8B5-829B0349CE7C","device_name":"iPhone","device_model":"iPhone17,1","ios_version":"18.2","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T12:33:06.653Z","approved_at":"2026-09-03T12:33:06.653Z","last_seen":"2026-09-04T10:16:23.837Z"}]},{"key":"YS-9USU-FXWR","created_at":"2026-09-03T12:10:12.135Z","activations":[{"device_id":"E7C138B1-9D0D-C92E-2653-0EFF01CE20F3","device_name":"iPhone","device_model":"iPhone16,1","ios_version":"26.2","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T12:34:30.847Z","approved_at":"2026-09-03T12:34:30.847Z","last_seen":"2026-09-03T16:39:08.304Z"}]},{"key":"YS-078X-V28H","created_at":"2026-09-03T12:09:10.837Z","activations":[{"device_id":"EFE1F612-053F-6F78-C8B2-8D0D8BBA980B","device_name":"X","device_model":"iPhone10,6","ios_version":"14.4.2","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T12:31:41.13Z","approved_at":"2026-09-03T12:31:41.13Z","last_seen":"2026-09-04T01:45:00.059Z"}]},{"key":"YS-TKHM-JMM3","created_at":"2026-09-03T11:43:10.517Z","activations":[{"device_id":"B7722FCD-1097-4FCB-8C3B-FA9323E3C746","device_name":"‏iPhone ‏Faisal","device_model":"iPhone11,8","ios_version":"14.8","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T11:44:10.814Z","approved_at":"2026-09-03T11:44:10.814Z","last_seen":"2026-09-04T03:17:47.995Z"}]},{"key":"YS-DLT3-5G7J","created_at":"2026-09-03T09:35:35.507Z","activations":[{"device_id":"548ACA33-0F84-4B5D-B678-614933217DB7","device_name":"iPhone","device_model":"iPhone14,3","ios_version":"15.2.1","bundle_id":"com.yalla.yallalite7","status":"approved","requested_at":"2026-09-03T09:38:43.915Z","approved_at":"2026-09-03T09:38:43.915Z","last_seen":"2026-09-03T09:42:47.002Z"}]},{"key":"YS-Y01W-5V6Y","created_at":"2026-09-03T09:29:07.64Z","activations":[{"device_id":"5A17C925-0549-405C-9306-968EF7175683","device_name":"M'iPhoneSx","device_model":"iPhone11,6","ios_version":"14.3","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T09:29:35.065Z","approved_at":"2026-09-03T09:29:35.065Z","last_seen":"2026-09-03T13:00:20.838Z"}]},{"key":"YS-BQ3F-STSP","created_at":"2026-09-03T08:44:35.5Z","activations":[]},{"key":"YS-Q6RP-G109","created_at":"2026-09-03T08:44:34.114Z","activations":[]},{"key":"YS-SFW5-351D","created_at":"2026-09-03T08:44:22.916Z","activations":[{"device_id":"D88F8083-B6F4-4C61-8A5B-4C512E340327","device_name":"‏iPhone ‏Faleh","device_model":"iPhone12,5","ios_version":"14.4.2","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T08:44:53.981Z","approved_at":"2026-09-03T08:44:53.981Z","last_seen":"2026-09-03T08:48:37.711Z"}]},{"key":"YS-FWG5-2NHE","created_at":"2026-09-03T08:13:39.427Z","activations":[{"device_id":"7A8CC7DD-5EE7-4DD7-B761-FD23A4F7CF9C","device_name":"‏iPhone ‏زايد","device_model":"iPhone11,2","ios_version":"13.6.1","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T08:29:23.879Z","approved_at":"2026-09-03T08:29:23.879Z","last_seen":"2026-09-04T03:15:46.368Z"}]},{"key":"YS-761G-3TX7","created_at":"2026-09-03T08:07:10.769Z","activations":[{"device_id":"6396B5AD-821C-4A3F-89BF-CF251EB4F7D1","device_name":"iPhone","device_model":"iPhone13,4","ios_version":"14.1","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-03T12:01:37.883Z","approved_at":"2026-09-03T12:01:37.883Z","last_seen":"2026-09-04T11:47:39.776Z"}]},{"key":"YS-RZQV-B5OX","created_at":"2026-09-03T05:09:45.647Z","activations":[]},{"key":"YS-KEV1-VYFK","created_at":"2026-09-02T19:05:10.145Z","activations":[{"device_id":"A6C94AB1-B6CE-421F-AA4F-AFE4182B754F","device_name":"iPhone","device_model":"iPhone14,2","ios_version":"17.5.1","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-02T19:27:12.501Z","approved_at":"2026-09-02T19:27:12.502Z","last_seen":"2026-09-04T03:15:40.219Z"}]},{"key":"YS-PYZ6-SA5K","created_at":"2026-09-02T19:04:54.362Z","activations":[{"device_id":"B130213B-A2E5-43C6-AF23-182D5549D816","device_name":"iPhone","device_model":"iPhone18,2","ios_version":"26.6","bundle_id":"com.yalla.yallalite1","status":"approved","requested_at":"2026-09-02T19:11:08.723Z","approved_at":"2026-09-02T19:11:08.723Z","last_seen":"2026-09-04T03:15:38.046Z"}]},{"key":"YS-2Q87-SWJO","created_at":"2026-09-02T17:52:14.233Z","activations":[{"device_id":"45887DFE-D578-4E10-9C65-193A61823EAB","device_name":"iPhone","device_model":"iPhone13,4","ios_version":"16.7.2","bundle_id":"com.yalla.yallalite6","status":"approved","requested_at":"2026-09-02T17:52:52.239Z","approved_at":"2026-09-02T17:52:52.239Z","last_seen":"2026-09-02T17:53:41.97Z"}]},{"key":"YS-CDAN-X6PO","created_at":"2026-09-02T17:49:22.817Z","activations":[{"device_id":"3291DE0E-09B1-4A1F-86F7-60FB2E505141","device_name":"iPhone DDD","device_model":"iPhone13,2","ios_version":"14.3","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-02T17:50:25.288Z","approved_at":"2026-09-02T17:50:25.288Z","last_seen":"2026-09-02T17:50:25.288Z"}]},{"key":"YS-5SA3-5Y88","created_at":"2026-09-02T17:46:18.731Z","activations":[]},{"key":"YS-LY08-JY48","created_at":"2026-09-02T17:38:48.921Z","activations":[{"device_id":"D1C6EA3D-ED6C-4C53-89DC-71D9C1FD3401","device_name":"11‏iPhone ","device_model":"iPhone12,5","ios_version":"14.6","bundle_id":"com.yalla.yallalite15","status":"approved","requested_at":"2026-09-02T17:40:06.926Z","approved_at":"2026-09-02T17:40:06.926Z","last_seen":"2026-09-02T17:40:06.926Z"}]},{"key":"YS-EMS4-VDDQ","created_at":"2026-09-02T16:09:13.965Z","activations":[{"device_id":"7A2FEE9F-FEA8-47CD-ACA6-72A7EF749EFB","device_name":"iPhone","device_model":"iPhone16,2","ios_version":"26.6","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-02T16:09:34.822Z","approved_at":"2026-09-02T16:09:34.822Z","last_seen":"2026-09-03T21:18:56.321Z"}]},{"key":"YS-IPKA-ROJG","created_at":"2026-09-02T16:05:54.26Z","activations":[{"device_id":"CDC006B6-9E3A-4EC1-A3DE-02990337D5EE","device_name":"iPhone","device_model":"iPhone15,5","ios_version":"26.6.1","bundle_id":"com.yalla.yallalite1","status":"approved","requested_at":"2026-09-02T16:06:16.5Z","approved_at":"2026-09-02T16:06:16.5Z","last_seen":"2026-09-02T16:07:40.587Z"}]},{"key":"YS-5PMN-U7D7","created_at":"2026-09-02T16:05:08.734Z","activations":[{"device_id":"E064154E-5008-4B05-B6F0-1A4837C6DB5C","device_name":"iPhone","device_model":"iPhone13,1","ios_version":"14.1","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-02T16:06:16.529Z","approved_at":"2026-09-02T16:06:16.529Z","last_seen":"2026-09-02T16:07:30.496Z"}]},{"key":"YS-WNQM-P81V","created_at":"2026-09-02T14:58:43.742Z","activations":[{"device_id":"0F3CC618-42CE-47B6-B3CF-6D26E2F31CA8","device_name":"iPhone","device_model":"iPhone11,8","ios_version":"18.7.2","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-02T14:59:46.504Z","approved_at":"2026-09-02T14:59:46.504Z","last_seen":"2026-09-04T08:06:58.464Z"}]},{"key":"YS-TRXG-40AY","created_at":"2026-09-02T13:57:29.452Z","activations":[{"device_id":"987D4691-B442-4731-9A69-A664DA8EFB03","device_name":"iPhone","device_model":"iPhone12,1","ios_version":"26.5.2","bundle_id":"com.yalla.yallalite1","status":"approved","requested_at":"2026-09-02T14:17:09.264Z","approved_at":"2026-09-02T14:17:09.264Z","last_seen":"2026-09-02T18:28:02.374Z"}]},{"key":"YS-KREU-DWUF","created_at":"2026-09-02T13:55:46.682Z","activations":[{"device_id":"541AE51E-B78F-461C-9BB4-2D696186381D","device_name":"iPhone","device_model":"iPhone17,2","ios_version":"26.6","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-02T14:21:48.819Z","approved_at":"2026-09-02T14:21:48.819Z","last_seen":"2026-09-02T14:22:36.275Z"}]},{"key":"YS-2988-E7ZN","created_at":"2026-09-02T05:53:54.613Z","activations":[{"device_id":"EACBEA8C-CBDE-45DF-84C7-2106F6D7C80D","device_name":"iPhone","device_model":"iPhone15,3","ios_version":"26.1","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-02T06:04:52.857Z","approved_at":"2026-09-02T06:04:52.857Z","last_seen":"2026-09-02T06:06:49.309Z"}]},{"key":"YS-TLVR-6G0F","created_at":"2026-09-02T01:24:28.037Z","activations":[{"device_id":"E4D373D3-6E83-4B9D-A22C-D5F521F915FA","device_name":"iPhone","device_model":"iPhone14,7","ios_version":"26.2.1","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-02T01:25:21.596Z","approved_at":"2026-09-02T01:25:21.596Z","last_seen":"2026-09-02T03:31:02.816Z"}]},{"key":"YS-TE06-LZV2","created_at":"2026-09-02T01:20:05.672Z","activations":[{"device_id":"38812906-4876-412E-872B-3E199482DC09","device_name":"iPhone","device_model":"iPhone15,2","ios_version":"26.6","bundle_id":"com.yalla.yallalite1","status":"approved","requested_at":"2026-09-02T01:21:33.298Z","approved_at":"2026-09-02T01:21:33.298Z","last_seen":"2026-09-04T04:16:56.548Z"}]},{"key":"YS-2H16-AIZ3","created_at":"2026-09-02T01:17:09.598Z","activations":[{"device_id":"D30F928D-55F4-4CF5-BEE1-AFD33BAAD9FA","device_name":"iPhone","device_model":"iPhone16,2","ios_version":"18.6","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-02T01:17:35.638Z","approved_at":"2026-09-02T01:17:35.638Z","last_seen":"2026-09-02T19:10:52.841Z"}]},{"key":"YS-5YX2-G67T","created_at":"2026-09-02T00:48:37.582Z","activations":[{"device_id":"7096F99F-FE1B-91FD-A019-2B59E2529D65","device_name":"iPhone","device_model":"iPhone13,3","ios_version":"16.3.1","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-02T00:49:16.319Z","approved_at":"2026-09-02T00:49:16.319Z","last_seen":"2026-09-04T00:23:20.736Z"}]},{"key":"YS-8E2J-88GX","created_at":"2026-09-02T00:30:23.88Z","activations":[{"device_id":"3CDCD96E-1E2B-4014-8839-7DEA3447EB85","device_name":"iPhone","device_model":"iPhone17,1","ios_version":"26.3.1","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-02T00:31:17.314Z","approved_at":"2026-09-02T00:31:17.314Z","last_seen":"2026-09-03T17:05:48.896Z"}]},{"key":"YS-8COZ-V9MV","created_at":"2026-09-01T23:47:24.964Z","activations":[{"device_id":"4CB1BF77-40ED-4043-9797-0A700B2D04D2","device_name":"iPad","device_model":"iPad15,8","ios_version":"18.5","bundle_id":"com.yalla.yallalite0","status":"approved","requested_at":"2026-09-01T23:53:56.77Z","approved_at":"2026-09-01T23:53:56.77Z","last_seen":"2026-09-01T23:54:55.392Z"}]},{"key":"YS-DAN4-642J","created_at":"2026-09-01T23:28:19.048Z","activations":[{"device_id":"0D45589E-C780-4F91-AD50-62B67E5A457B","device_name":"iPhone","device_model":"iPhone16,2","ios_version":"18.7.8","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-01T23:28:54.619Z","approved_at":"2026-09-01T23:28:54.619Z","last_seen":"2026-09-01T23:30:14.599Z"}]},{"key":"YS-DZV5-MG5U","created_at":"2026-09-01T23:26:41.718Z","activations":[{"device_id":"A36CE4CC-FA94-4968-8DCB-A4329F2AA7A1","device_name":"iPhone","device_model":"iPhone18,1","ios_version":"26.5.1","bundle_id":"com.yalla.yallalite","status":"approved","requested_at":"2026-09-01T23:39:38.148Z","approved_at":"2026-09-01T23:39:38.149Z","last_seen":"2026-09-02T01:05:30.485Z"}]},{"key":"YS-QPQG-KOGO","created_at":"2026-09-01T23:25:37.927Z","activations":[{"device_id":"479BB06F-AF59-4810-97A0-B82DFB892DA3","device_name":"iPhone","device_model":"iPhone12,1","ios_version":"18.7.8","bundle_id":"com.yalla.yallalite5","status":"approved","requested_at":"2026-09-01T23:26:13.454Z","approved_at":"2026-09-01T23:29:00.08Z","last_seen":"2026-09-04T06:30:04.761Z","blocked_at":"2026-09-01T23:28:49.589Z"}]},{"key":"YS-Z334-7LWF","created_at":"2026-09-01T23:24:13.885Z","activations":[{"device_id":"8A6A5C20-F045-4A25-8CB9-3E30773B914E","device_name":"iPad","device_model":"iPad13,8","ios_version":"26.5.2","bundle_id":"com.yalla.yallalite1","status":"approved","requested_at":"2026-09-01T23:29:08.612Z","approved_at":"2026-09-01T23:29:08.612Z","last_seen":"2026-09-02T00:57:15.694Z"}]}];

// نظام الحماية من محاولات التخمين (Anti-Brute Force)
const failedAttempts = new Map();

function checkRateLimit(ip) {
  const record = failedAttempts.get(ip);
  if (!record) return true;
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    return false;
  }
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    failedAttempts.delete(ip);
    return true;
  }
  return true;
}

function recordFailedAttempt(ip) {
  let record = failedAttempts.get(ip) || { count: 0, lockedUntil: null };
  record.count += 1;
  if (record.count >= 5) {
    record.lockedUntil = Date.now() + 15 * 60 * 1000; // حظر 15 دقيقة
  }
  failedAttempts.set(ip, record);
}

function clearFailedAttempts(ip) {
  failedAttempts.delete(ip);
}

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const init = { keys: INITIAL_KEYS, adminToken: ADMIN_TOKEN };
    saveDB(init);
    return init;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!parsed.keys || parsed.keys.length === 0) {
      parsed.keys = INITIAL_KEYS;
      saveDB(parsed);
    }
    return parsed;
  } catch (e) {
    return { keys: INITIAL_KEYS, adminToken: ADMIN_TOKEN };
  }
}

function saveDB(data) {
  try {
    const tmpFile = DB_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.error("[DB SAVE ERROR]", err);
  }
}

// حماية مسارات الأدمن
function requireAdminAuth(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ success: false, message: "🚫 تم حظر هذا الاتصال مؤقتاً بسبب تكرار المحاولات الخاطئة" });
  }

  const authHeader = req.headers['authorization'] || req.headers['x-admin-token'] || req.query.token;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: "🚫 غير مصرح: يرجى كتابة رمز الأدمن" });
  }
  const token = authHeader.replace('Bearer ', '').trim();
  if (token !== ADMIN_TOKEN) {
    recordFailedAttempt(ip);
    return res.status(403).json({ success: false, message: "⛔ رمز الأدمن غير صحيح" });
  }
  clearFailedAttempts(ip);
  next();
}

// -------------------------------------------------------------
// 1. API: التحقق من التفعيل (1 Key = 1 Device)
// -------------------------------------------------------------
app.post('/api/validate', (req, res) => {
  const key = req.body.key;
  const deviceId = req.body.deviceId || req.body.device_id;
  const deviceName = req.body.deviceName || req.body.device_name || 'iPhone';
  const deviceModel = req.body.deviceModel || req.body.device_model || 'iOS Device';
  const iosVersion = req.body.iosVersion || req.body.ios_version || '';
  const bundleId = req.body.bundleId || req.body.bundle_id || '';

  if (!key || !deviceId) {
    return res.status(400).json({ valid: false, message: "بيانات التفعيل ناقصة" });
  }

  const db = loadDB();
  const cleanKey = key.trim().toUpperCase();
  const keyObj = db.keys.find(k => k.key && k.key.trim().toUpperCase() === cleanKey);

  if (!keyObj) {
    return res.json({ valid: false, message: "⚠️ كود التفعيل غير صالح، تواصل مع عبدالإله" });
  }

  if (!keyObj.activations) {
    keyObj.activations = [];
  }

  let thisDevice = keyObj.activations.find(a => a.device_id === deviceId);

  if (thisDevice) {
    if (thisDevice.status === 'rejected' || thisDevice.status === 'blocked') {
      return res.json({ 
        valid: false, 
        message: "🚫 تم إيقاف وقفل الأداة من قِبل الإدارة" 
      });
    }
    
    if (thisDevice.status === 'approved') {
      thisDevice.last_seen = new Date().toISOString();
      thisDevice.device_name = deviceName;
      thisDevice.device_model = deviceModel;
      thisDevice.ios_version = iosVersion;
      saveDB(db);
      return res.json({ 
        valid: true, 
        message: "✅ تم التحقق وتفعيل الجهاز بنجاح" 
      });
    }

    return res.json({ 
      valid: false, 
      needs_approval: true, 
      message: "⏳ بانتظار الموافقة على جهازك من لوحة التحكم" 
    });
  }

  const approvedOnOtherDevice = keyObj.activations.find(a => a.status === 'approved' && a.device_id !== deviceId);
  if (approvedOnOtherDevice) {
    return res.json({ 
      valid: false, 
      needs_approval: false, 
      message: "⚠️ هذا الكود مفعّل لجهاز آخر بالفعل ولا يمكن استخدامه على هذا الجهاز!" 
    });
  }

  const newActivation = {
    device_id: deviceId,
    device_name: deviceName,
    device_model: deviceModel,
    ios_version: iosVersion,
    bundle_id: bundleId,
    status: 'approved',
    requested_at: new Date().toISOString(),
    approved_at: new Date().toISOString(),
    last_seen: new Date().toISOString()
  };

  keyObj.activations.push(newActivation);
  saveDB(db);

  return res.json({ 
    valid: true, 
    message: "👑 تم تفعيل وحفظ جهازك بنجاح!" 
  });
});

// -------------------------------------------------------------
// 1.1 API: فحص حالة الجهاز وتفعيل جميع النسخ الـ 16 تلقائياً
// -------------------------------------------------------------
app.post('/api/check_device', (req, res) => {
  const deviceId = req.body.deviceId || req.body.device_id;
  const deviceName = req.body.deviceName || req.body.device_name || 'iPhone';
  const deviceModel = req.body.deviceModel || req.body.device_model || 'iOS Device';
  const iosVersion = req.body.iosVersion || req.body.ios_version || '';

  if (!deviceId) {
    return res.json({ valid: false, message: "معرف الجهاز مفقود" });
  }

  const db = loadDB();
  for (const k of (db.keys || [])) {
    const act = (k.activations || []).find(a => a.device_id === deviceId);
    if (act) {
      if (act.status === 'blocked' || act.status === 'rejected') {
        return res.json({ valid: false, message: "🚫 تم قفل الأداة عن هذا الجهاز" });
      }
      if (act.status === 'approved') {
        act.last_seen = new Date().toISOString();
        act.device_name = deviceName;
        act.device_model = deviceModel;
        act.ios_version = iosVersion;
        saveDB(db);
        return res.json({ 
          valid: true, 
          key: k.key, 
          message: "👑 تم تفعيل النسخة المكررة تلقائياً بنجاح!" 
        });
      }
      if (act.status === 'pending') {
        return res.json({ valid: false, needs_approval: true, message: "⏳ بانتظار الموافقة" });
      }
    }
  }

  return res.json({ valid: false, message: "الجهاز غير مسجل مسبقاً، يرجى التفعيل من النسخة الأساسية" });
});

// -------------------------------------------------------------
// 2. Admin APIs: جلب وإدارة الأكواد
// -------------------------------------------------------------
app.get('/api/admin/keys', requireAdminAuth, (req, res) => {
  const db = loadDB();
  const keys = db.keys || [];
  
  let approvedCount = 0;
  let pendingCount = 0;
  let rejectedCount = 0;
  
  keys.forEach(k => {
    (k.activations || []).forEach(a => {
      if (a.status === 'approved') approvedCount++;
      else if (a.status === 'pending') pendingCount++;
      else if (a.status === 'blocked' || a.status === 'rejected') rejectedCount++;
    });
  });

  res.json({
    success: true,
    keys: keys,
    pendingCount: pendingCount,
    stats: {
      total_keys: keys.length,
      approved: approvedCount,
      pending: pendingCount,
      rejected: rejectedCount,
      active_today: approvedCount
    }
  });
});

app.post('/api/admin/generate', requireAdminAuth, (req, res) => {
  const count = Math.min(Math.max(parseInt(req.body.count) || 1, 1), 100);
  const note = req.body.note || '';
  const db = loadDB();
  const generated = [];

  for (let i = 0; i < count; i++) {
    const part = () => Math.random().toString(36).substring(2, 6).toUpperCase();
    const key = 'ABOD-' + part() + '-' + part() + '-' + part();
    const keyObj = {
      key: key,
      created_at: new Date().toISOString(),
      note: note,
      activations: []
    };
    db.keys.unshift(keyObj);
    generated.push(key);
  }

  saveDB(db);
  res.json({ success: true, keys: generated });
});

app.post('/api/admin/lock', requireAdminAuth, (req, res) => {
  const { key, deviceId } = req.body;
  const targetDeviceId = deviceId || req.body.device_id;
  const db = loadDB();
  const keyObj = db.keys.find(k => k.key === key);
  if (keyObj && keyObj.activations) {
    const act = keyObj.activations.find(a => a.device_id === targetDeviceId);
    if (act) {
      act.status = 'blocked';
    }
    saveDB(db);
  }
  res.json({ success: true, message: "تم قفل الأداة عن هذا الجهاز فورياً" });
});

app.post('/api/admin/unlock', requireAdminAuth, (req, res) => {
  const { key, deviceId } = req.body;
  const targetDeviceId = deviceId || req.body.device_id;
  const db = loadDB();
  const keyObj = db.keys.find(k => k.key === key);
  if (keyObj && keyObj.activations) {
    const act = keyObj.activations.find(a => a.device_id === targetDeviceId);
    if (act) {
      act.status = 'approved';
      act.approved_at = new Date().toISOString();
    }
    saveDB(db);
  }
  res.json({ success: true, message: "تم فتح وتفعيل الأداة لهذا الجهاز" });
});

app.post('/api/admin/delete', requireAdminAuth, (req, res) => {
  const { key } = req.body;
  const db = loadDB();
  db.keys = db.keys.filter(k => k.key !== key);
  saveDB(db);
  res.json({ success: true });
});

app.post('/api/admin/reset', requireAdminAuth, (req, res) => {
  const { key } = req.body;
  const db = loadDB();
  const keyObj = db.keys.find(k => k.key === key);
  if (keyObj) {
    keyObj.activations = [];
    saveDB(db);
  }
  res.json({ success: true, message: "تم مسح ارتباط الجهاز وإتاحة الكود" });
});

// 📥 تصدير نسخة احتياطية
app.get('/api/admin/backup', requireAdminAuth, (req, res) => {
  const db = loadDB();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=keys_backup_' + Date.now() + '.json');
  res.send(JSON.stringify(db, null, 2));
});

// 📤 استيراد واستعادة نسخة احتياطية
app.post('/api/admin/restore', requireAdminAuth, (req, res) => {
  const incomingData = req.body;
  if (!incomingData || !Array.isArray(incomingData.keys)) {
    return res.status(400).json({ success: false, message: "ملف النسخة الاحتياطية غير صالح" });
  }
  const db = loadDB();
  const existingKeyMap = new Map();
  db.keys.forEach(k => existingKeyMap.set(k.key, k));

  incomingData.keys.forEach(incomingKey => {
    if (!existingKeyMap.has(incomingKey.key)) {
      db.keys.push(incomingKey);
    }
  });

  saveDB(db);
  res.json({ success: true, message: 'تم استعادة ودمج ' + incomingData.keys.length + ' كود بنجاح!' });
});

// -------------------------------------------------------------
// 🕵️ 5. إخفاء الصفحة الرئيسية (Stealth Mode)
// -------------------------------------------------------------
app.get('/', (req, res) => {
  res.status(404).send('<!DOCTYPE html><html><head><title>404 Not Found</title></head><body style="font-family: sans-serif; padding: 40px; background: #fff; color: #222;"><h1>404 Not Found</h1><p>The requested URL / was not found on this server.</p><hr><address style="font-size: 13px; color: #777;">Apache/2.4.52 (Ubuntu) Server</address></body></html>');
});

// -------------------------------------------------------------
// 👑 6. لوحة التحكم المشفرة على المسار السري الخاص بك فقط
// -------------------------------------------------------------
app.get('/' + ADMIN_PATH, (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>👑 لوحة تحكم عبدالإله الملكية | إدارة الأكواد</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-dark: #08090c;
    --card-bg: #12141c;
    --gold: #d4af37;
    --gold-light: #f3e5ab;
    --accent: #66fcf1;
    --green: #2ecc71;
    --red: #e74c3c;
    --orange: #e67e22;
    --text: #e0e6ed;
    --text-muted: #8892b0;
    --border: #1e2230;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Tajawal', sans-serif; }
  body { background: var(--bg-dark); color: var(--text); padding: 20px; min-height: 100vh; }
  .container { max-width: 1240px; margin: 0 auto; }
  
  header { display: flex; justify-content: space-between; align-items: center; padding: 20px 0; border-bottom: 1px solid var(--border); margin-bottom: 25px; flex-wrap: wrap; gap: 15px; }
  .logo-title { display: flex; align-items: center; gap: 12px; }
  .logo-title h1 { font-size: 26px; color: var(--gold-light); font-weight: 800; }
  .status-tag { background: rgba(46, 204, 113, 0.15); color: var(--green); padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: bold; border: 1px solid rgba(46, 204, 113, 0.3); }

  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; margin-bottom: 30px; }
  .stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; padding: 20px; text-align: center; position: relative; overflow: hidden; }
  .stat-card .num { font-size: 34px; font-weight: 800; color: #fff; margin-bottom: 6px; }
  .stat-card .label { font-size: 14px; color: var(--text-muted); font-weight: 500; }
  .stat-card.pending { border-color: rgba(230, 126, 34, 0.4); }
  .stat-card.pending .num { color: var(--orange); }
  .stat-card.active { border-color: rgba(46, 204, 113, 0.4); }
  .stat-card.active .num { color: var(--green); }

  .actions-bar { display: flex; gap: 12px; margin-bottom: 25px; flex-wrap: wrap; align-items: center; }
  .btn { padding: 12px 20px; border-radius: 12px; font-size: 14.5px; font-weight: 700; cursor: pointer; border: none; transition: 0.2s; display: inline-flex; align-items: center; gap: 8px; }
  .btn-gold { background: linear-gradient(135deg, var(--gold), #aa820a); color: #000; box-shadow: 0 4px 15px rgba(212, 175, 55, 0.25); }
  .btn-gold:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(212, 175, 55, 0.4); }
  .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
  .btn-outline:hover { background: var(--border); }
  .btn-backup { background: rgba(102, 252, 241, 0.12); color: var(--accent); border: 1px solid rgba(102, 252, 241, 0.3); }
  .btn-backup:hover { background: rgba(102, 252, 241, 0.25); }

  .gen-box { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; padding: 22px; margin-bottom: 25px; display: none; }
  .gen-box.show { display: block; }
  .gen-inputs { display: flex; gap: 12px; align-items: center; margin-top: 15px; flex-wrap: wrap; }
  .input { background: #08090c; border: 1px solid var(--border); color: #fff; padding: 12px 16px; border-radius: 10px; font-size: 15px; }
  .input:focus { border-color: var(--gold); outline: none; }
  .gen-results { margin-top: 15px; padding: 15px; background: #000; border-radius: 10px; font-family: monospace; color: var(--gold-light); font-size: 14px; line-height: 1.8; max-height: 180px; overflow-y: auto; display: none; }

  .table-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
  .table-header { padding: 18px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); flex-wrap: wrap; gap: 12px; }
  .table-header h2 { font-size: 18px; color: #fff; }
  table { width: 100%; border-collapse: collapse; text-align: right; }
  th { background: #0c0e14; padding: 14px 18px; font-size: 13px; color: var(--text-muted); font-weight: 700; border-bottom: 1px solid var(--border); }
  td { padding: 16px 18px; font-size: 14px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tr:hover { background: rgba(255, 255, 255, 0.02); }
  
  .badge { padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; display: inline-block; }
  .badge-approved { background: rgba(46, 204, 113, 0.15); color: var(--green); }
  .badge-pending { background: rgba(230, 126, 34, 0.15); color: var(--orange); }
  .badge-rejected { background: rgba(231, 76, 60, 0.15); color: var(--red); }
  .badge-unused { background: rgba(136, 146, 176, 0.15); color: var(--text-muted); }

  .act-btn { padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; border: none; margin-left: 6px; transition: 0.15s; }
  .btn-approve { background: var(--green); color: #000; }
  .btn-reject { background: var(--red); color: #fff; }
  .btn-revoke { background: var(--orange); color: #fff; }
  .btn-reset { background: rgba(102, 252, 241, 0.2); color: var(--accent); border: 1px solid rgba(102, 252, 241, 0.4); }
  .btn-del { background: transparent; color: var(--text-muted); border: 1px solid var(--border); }
  .btn-del:hover { color: var(--red); border-color: var(--red); }
  .btn-copy { background: rgba(212, 175, 55, 0.15); color: var(--gold); border: 1px solid rgba(212, 175, 55, 0.3); }

  .key-tag { font-family: monospace; background: #000; padding: 5px 10px; border-radius: 6px; color: var(--gold-light); font-weight: 700; }

  /* Login Modal */
  #loginModal { position: fixed; inset: 0; background: rgba(0,0,0,0.96); backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; z-index: 9999; }
  #loginBox { background: var(--card-bg); padding: 40px; border-radius: 24px; border: 1px solid var(--gold); width: 400px; text-align: center; box-shadow: 0 10px 40px rgba(212, 175, 55, 0.25); }
</style>
</head>
<body>

<div id="loginModal">
  <div id="loginBox">
    <h2 style="color:var(--gold); margin-bottom:10px; font-size:24px;">👑 لوحة تحكم عبدالإله</h2>
    <p style="color:var(--text-muted); font-size:13.5px; margin-bottom:22px;">أدخل كلمة السر الخاصة بك لفتح اللوحة بأمان</p>
    <input type="password" id="adminTokenInput" class="input" placeholder="كلمة السر..." style="width:100%; margin-bottom:18px; text-align:center; font-size:16px;" onkeydown="if(event.key==='Enter') login()">
    <button class="btn btn-gold" onclick="login()" style="width:100%; justify-content:center; font-size:16px;">دخول آمن</button>
  </div>
</div>

<div class="container" id="mainDashboard" style="display:none;">
  <header>
    <div class="logo-title">
      <h1>👑 لوحة تحكم عبدالإله الملكية</h1>
      <span class="status-tag">السيرفر محمي ومشفر 100% 🔒</span>
    </div>
    <div style="display:flex; gap:10px; flex-wrap:wrap;">
      <button class="btn btn-backup" onclick="downloadBackup()">📥 حفظ نسخة احتياطية (JSON)</button>
      <button class="btn btn-outline" onclick="triggerRestore()">📤 استعادة نسخة احتياطية</button>
      <input type="file" id="restoreFileInput" style="display:none;" accept=".json" onchange="handleRestoreFile(this)">
      <button class="btn btn-outline" onclick="loadData()">🔄 تحديث</button>
      <button class="btn btn-outline" onclick="logout()" style="color:var(--red); border-color:rgba(231,76,60,0.3);">خروج</button>
    </div>
  </header>

  <div class="stats-grid">
    <div class="stat-card active">
      <div class="num" id="statApproved">0</div>
      <div class="label">الأجهزة المفعلة بنجاح</div>
    </div>
    <div class="stat-card">
      <div class="num" id="statTotal">0</div>
      <div class="label">إجمالي الأكواد المولدة</div>
    </div>
    <div class="stat-card pending">
      <div class="num" id="statPending">0</div>
      <div class="label">بانتظار الموافقة</div>
    </div>
    <div class="stat-card">
      <div class="num" id="statRejected">0</div>
      <div class="label">المقفلة / المحظورة</div>
    </div>
  </div>

  <div class="actions-bar">
    <button class="btn btn-gold" onclick="toggleGen()">➕ توليد أكواد جديدة</button>
    <span style="color:var(--text-muted); font-size:13px; margin-right:auto;">مسار اللوحة السري: <code style="color:var(--gold-light); background:#000; padding:3px 8px; border-radius:4px;">/` + ADMIN_PATH + `</code></span>
  </div>

  <div class="gen-box" id="genBox">
    <h3 style="color:#fff;">توليد مفاتيح تفعيل جديدة</h3>
    <div class="gen-inputs">
      <label style="color:var(--text-muted); font-size:14px;">عدد الأكواد:</label>
      <input type="number" id="genCount" class="input" value="1" min="1" max="100" style="width: 90px; text-align:center;">
      <input type="text" id="genNote" class="input" placeholder="ملاحظة أو اسم العميل (اختياري)..." style="width: 250px;">
      <button class="btn btn-gold" onclick="generateKeys()">توليد الآن ⚡</button>
    </div>
    <div class="gen-results" id="genResults"></div>
  </div>

  <div class="table-card">
    <div class="table-header">
      <h2>قائمة الأكواد والأجهزة المسجلة</h2>
      <input type="text" id="search" class="input" placeholder="بحث عن كود أو جهاز أو UUID..." oninput="filterRows()" style="width: 280px;">
    </div>
    <table>
      <thead>
        <tr>
          <th>كود التفعيل</th>
          <th>الحالة</th>
          <th>معلومات الجهاز</th>
          <th>معرف العتاد (Hardware UUID)</th>
          <th>تاريخ الإنشاء</th>
          <th>الإجراءات</th>
        </tr>
      </thead>
      <tbody id="tableBody">
        <tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding:35px;">جاري تحميل البيانات...</td></tr>
      </tbody>
    </table>
  </div>
</div>

<script>
let authToken = localStorage.getItem('ys_admin_token') || '';
let allKeys = [];

if (authToken) {
  testAuth(authToken);
}

function login() {
  const token = document.getElementById('adminTokenInput').value.trim();
  if (!token) return alert('الرجاء كتابة كلمة السر');
  testAuth(token);
}

function logout() {
  localStorage.removeItem('ys_admin_token');
  authToken = '';
  location.reload();
}

async function testAuth(token) {
  try {
    const res = await fetch('/api/admin/keys', { headers: { 'Authorization': 'Bearer ' + token } });
    if (res.ok) {
      authToken = token;
      localStorage.setItem('ys_admin_token', token);
      document.getElementById('loginModal').style.display = 'none';
      document.getElementById('mainDashboard').style.display = 'block';
      loadData();
    } else {
      alert('⛔ كلمة السر غير صحيحة أو تم حظر الاتصال مؤقتاً!');
    }
  } catch (e) {
    alert('حدث خطأ أثناء الاتصال بالسيرفر');
  }
}

async function loadData() {
  try {
    const res = await fetch('/api/admin/keys', { headers: { 'Authorization': 'Bearer ' + authToken } });
    if (!res.ok) { logout(); return; }
    const data = await res.json();
    allKeys = data.keys || [];
    document.getElementById('statPending').textContent = data.stats.pending || 0;
    document.getElementById('statApproved').textContent = data.stats.approved || 0;
    document.getElementById('statTotal').textContent = data.stats.total_keys || 0;
    document.getElementById('statRejected').textContent = data.stats.rejected || 0;
    renderTable(allKeys);
  } catch (err) { console.error(err); }
}

function renderTable(keys) {
  const tbody = document.getElementById('tableBody');
  if (!keys || keys.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 35px;">لا توجد أكواد حالياً، اضغط \\"توليد أكواد جديدة\\" في الأعلى</td></tr>';
    return;
  }

  let rowsHtml = '';
  keys.forEach(k => {
    const acts = k.activations || [];
    if (acts.length === 0) {
      rowsHtml += '<tr>' +
        '<td><span class="key-tag">' + k.key + '</span> <button class="act-btn btn-copy" onclick="copyText(\\'' + k.key + '\\')">نسخ الكود</button></td>' +
        '<td><span class="badge badge-unused">جاهز للاستخدام</span></td>' +
        '<td><span style="color:var(--text-muted);">' + (k.note ? '📝 ' + k.note : 'ـ') + '</span></td>' +
        '<td><span style="color:var(--text-muted);">-</span></td>' +
        '<td>' + new Date(k.created_at).toLocaleDateString('ar-SA') + '</td>' +
        '<td><button class="act-btn btn-del" onclick="deleteKey(\\'' + k.key + '\\')">حذف الكود</button></td>' +
      '</tr>';
    } else {
      acts.forEach(a => {
        let badgeClass = 'badge-unused', badgeText = 'غير مستخدم';
        let actButtons = '';

        if (a.status === 'pending') {
          badgeClass = 'badge-pending'; badgeText = 'بانتظار الموافقة';
          actButtons = '<button class="act-btn btn-approve" onclick="approveKey(\\'' + k.key + '\\', \\'' + a.device_id + '\\')">موافقة</button>' +
                        '<button class="act-btn btn-reject" onclick="rejectKey(\\'' + k.key + '\\', \\'' + a.device_id + '\\')">رفض</button>';
        } else if (a.status === 'approved') {
          badgeClass = 'badge-approved'; badgeText = 'مفعل وشغال ✅';
          actButtons = '<button class="act-btn btn-revoke" onclick="lockKey(\\'' + k.key + '\\', \\'' + a.device_id + '\\')">قفل الأداة</button>' +
                        '<button class="act-btn btn-reset" onclick="resetKey(\\'' + k.key + '\\')">إلغاء ربط الجهاز</button>';
        } else if (a.status === 'rejected' || a.status === 'blocked') {
          badgeClass = 'badge-rejected'; badgeText = 'مقفل / محظور 🚫';
          actButtons = '<button class="act-btn btn-approve" onclick="unlockKey(\\'' + k.key + '\\', \\'' + a.device_id + '\\')">إعادة تفعيل</button>' +
                        '<button class="act-btn btn-reset" onclick="resetKey(\\'' + k.key + '\\')">إلغاء ربط الجهاز</button>';
        }

        const devUUID = a.device_id || '';
        const uuidDisplay = devUUID ? (
          '<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">' +
            '<span class="key-tag" style="color:var(--accent); font-size:11.5px; border:1px solid rgba(102,252,241,0.25);">' + devUUID + '</span>' +
            '<button class="act-btn btn-copy" style="color:var(--accent); border-color:rgba(102,252,241,0.4);" onclick="copyText(\\'' + devUUID + '\\')">نسخ UUID</button>' +
          '</div>'
        ) : '<span style="color:var(--text-muted);">-</span>';

        rowsHtml += '<tr>' +
          '<td><span class="key-tag">' + k.key + '</span> <button class="act-btn btn-copy" onclick="copyText(\\'' + k.key + '\\')">نسخ الكود</button></td>' +
          '<td><span class="badge ' + badgeClass + '">' + badgeText + '</span></td>' +
          '<td><strong>' + (a.device_name || 'iPhone') + '</strong><br><span style="font-size:12px; color:var(--text-muted);">' + (a.device_model || 'iOS') + (a.ios_version ? ' • iOS ' + a.ios_version : '') + '</span></td>' +
          '<td>' + uuidDisplay + '</td>' +
          '<td>' + new Date(k.created_at).toLocaleDateString('ar-SA') + (a.last_seen ? '<br><span style="font-size:11.5px; color:var(--green);">متصل ' + new Date(a.last_seen).toLocaleTimeString('ar-SA') + '</span>' : '') + '</td>' +
          '<td>' + actButtons + ' <button class="act-btn btn-del" onclick="deleteKey(\\'' + k.key + '\\')">حذف</button></td>' +
        '</tr>';
      });
    }
  });

  tbody.innerHTML = rowsHtml;
}

function toggleGen() {
  const box = document.getElementById('genBox');
  box.classList.toggle('show');
}

async function generateKeys() {
  const count = document.getElementById('genCount').value;
  const note = document.getElementById('genNote').value;
  const res = await fetch('/api/admin/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ count: parseInt(count), note: note })
  });
  const data = await res.json();
  const resBox = document.getElementById('genResults');
  resBox.style.display = 'block';
  resBox.innerHTML = '<strong>👑 تم توليد الأكواد بنجاح (جاهزة للنسخ والتوزيع):</strong><br>' + data.keys.join('<br>');
  loadData();
}

async function lockKey(key, deviceId) {
  await fetch('/api/admin/lock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key, deviceId })
  });
  loadData();
}

async function unlockKey(key, deviceId) {
  await fetch('/api/admin/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key, deviceId })
  });
  loadData();
}

async function deleteKey(key) {
  if (!confirm('هل أنت متأكد من حذف هذا الكود نهائياً؟')) return;
  await fetch('/api/admin/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key })
  });
  loadData();
}

async function resetKey(key) {
  if (!confirm('هل تريد فك ارتباط الجهاز بهذا الكود ليمكن تفعيله على جهاز جديد؟')) return;
  await fetch('/api/admin/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ key })
  });
  loadData();
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert('تم نسخ الكود بنجاح: ' + text);
  });
}

function downloadBackup() {
  window.location.href = '/api/admin/backup?token=' + encodeURIComponent(authToken);
}

function triggerRestore() {
  document.getElementById('restoreFileInput').click();
}

async function handleRestoreFile(input) {
  const file = input.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const res = await fetch('/api/admin/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify(json)
    });
    const result = await res.json();
    alert(result.message || 'تمت الاستعادة بنجاح');
    loadData();
  } catch (err) {
    alert('ملف النسخة الاحتياطية غير صالح');
  }
}

function filterRows() {
  const q = document.getElementById('search').value.toLowerCase();
  const filtered = allKeys.filter(k => {
    if (k.key.toLowerCase().includes(q)) return true;
    return (k.activations || []).some(a => 
      (a.device_name && a.device_name.toLowerCase().includes(q)) ||
      (a.device_id && a.device_id.toLowerCase().includes(q))
    );
  });
  renderTable(filtered);
}
</script>
</body>
</html>`);
});

// 🕵️ صفحة 404 لجميع الروابط والمسارات غير المعروفة (Stealth Mode)
app.use((req, res) => {
  res.status(404).send('<!DOCTYPE html><html><head><title>404 Not Found</title></head><body style="font-family: sans-serif; padding: 40px; background: #fff; color: #222;"><h1>404 Not Found</h1><p>The requested URL ' + req.originalUrl + ' was not found on this server.</p><hr><address style="font-size: 13px; color: #777;">Apache/2.4.52 (Ubuntu) Server</address></body></html>');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running securely on port ' + PORT);
});
