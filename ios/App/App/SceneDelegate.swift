import UIKit
import Capacitor
import WebKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private let webCacheVersionKey = "LastLaunchedWebBundleVersion"

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let showApp = {
            self.window = UIWindow(windowScene: windowScene)
            self.window?.rootViewController = CAPBridgeViewController()
            self.window?.makeKeyAndVisible()
            SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        }

        // TestFlight updates keep WKWebView's cached index.html, which still
        // points at the previous build's hashed scripts. Those files are gone,
        // so the web view stays blank. Drop the HTTP/script caches before the
        // bridge loads, and leave localStorage alone so people stay signed in.
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""
        let defaults = UserDefaults.standard
        guard defaults.string(forKey: webCacheVersionKey) != version else {
            showApp()
            return
        }

        URLCache.shared.removeAllCachedResponses()

        var didShow = false
        let showOnce = {
            if didShow { return }
            didShow = true
            defaults.set(version, forKey: self.webCacheVersionKey)
            showApp()
        }

        var types: Set<String> = [
            WKWebsiteDataTypeDiskCache,
            WKWebsiteDataTypeMemoryCache,
            WKWebsiteDataTypeOfflineWebApplicationCache,
            WKWebsiteDataTypeServiceWorkerRegistrations,
        ]
        if #available(iOS 17.0, *) {
            types.insert(WKWebsiteDataTypeFetchCache)
        }

        WKWebsiteDataStore.default().removeData(
            ofTypes: types,
            modifiedSince: Date(timeIntervalSince1970: 0)
        ) {
            DispatchQueue.main.async { showOnce() }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { showOnce() }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
