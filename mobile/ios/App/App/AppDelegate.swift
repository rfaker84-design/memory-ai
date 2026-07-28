import UIKit
import Capacitor
import Photos
import PhotosUI
import UniformTypeIdentifiers

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

final class MemoryAppViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(MemoryMediaPlugin())
    }
}

@objc(MemoryMediaPlugin)
final class MemoryMediaPlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate {
    let identifier = "MemoryMediaPlugin"
    let jsName = "MemoryMedia"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pickMedia", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveVideo", returnType: CAPPluginReturnPromise),
    ]
    private var pendingPickerCall: CAPPluginCall?

    @objc func pickMedia(_ call: CAPPluginCall) {
        var config = PHPickerConfiguration(photoLibrary: .shared())
        config.selectionLimit = min(max(call.getInt("limit", 20), 1), 20)
        config.filter = .any(of: [.images, .videos])
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = self
        pendingPickerCall = call
        bridge?.viewController?.present(picker, animated: true)
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let call = pendingPickerCall else { return }
        pendingPickerCall = nil
        if results.isEmpty { call.reject("MEDIA_PICK_CANCELLED"); return }

        let group = DispatchGroup()
        let lock = NSLock()
        var items = [[String: String]]()
        for result in results {
            group.enter()
            let provider = result.itemProvider
            let type = provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier)
                ? UTType.movie.identifier
                : UTType.image.identifier
            provider.loadFileRepresentation(forTypeIdentifier: type) { source, _ in
                defer { group.leave() }
                guard let source else { return }
                let destination = FileManager.default.temporaryDirectory.appendingPathComponent("memoryai-\(UUID().uuidString)-\(source.lastPathComponent)")
                do {
                    try FileManager.default.copyItem(at: source, to: destination)
                    lock.lock()
                    items.append([
                        "uri": destination.absoluteString,
                        "mimeType": type == UTType.movie.identifier ? "video/mp4" : "image/jpeg",
                        "name": destination.lastPathComponent,
                    ])
                    lock.unlock()
                } catch { }
            }
        }
        group.notify(queue: .main) { call.resolve(["items": items]) }
    }

    @objc func saveVideo(_ call: CAPPluginCall) {
        guard let signedUrl = call.getString("signedUrl"), let remoteURL = URL(string: signedUrl), remoteURL.scheme == "https" else {
            call.reject("SIGNED_VIDEO_URL_REQUIRED")
            return
        }
        let fileName = call.getString("fileName", "memoryai-video.mp4")
        URLSession.shared.downloadTask(with: remoteURL) { [weak self] temporaryURL, response, error in
            guard let self, error == nil, let temporaryURL, let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                call.reject("SIGNED_VIDEO_DOWNLOAD_FAILED")
                return
            }
            let destination = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
            do {
                try? FileManager.default.removeItem(at: destination)
                try FileManager.default.copyItem(at: temporaryURL, to: destination)
            } catch {
                call.reject("VIDEO_SAVE_FAILED", error)
                return
            }
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                guard status == .authorized || status == .limited else { call.reject("PHOTO_LIBRARY_PERMISSION_DENIED"); return }
                PHPhotoLibrary.shared().performChanges({ PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: destination) }) { saved, saveError in
                    try? FileManager.default.removeItem(at: destination)
                    if saved { call.resolve(["uri": "photos://memoryai-video"]) }
                    else { call.reject("VIDEO_SAVE_FAILED", saveError) }
                }
            }
        }.resume()
    }
}
