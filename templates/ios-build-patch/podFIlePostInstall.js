const newPostInstallBlock = 
`post_install do |installer|
  react_native_post_install(
    installer,
    config[:reactNativePath],
    :mac_catalyst_enabled => false
  )

  # Set provisioning profile to "None" for all pod targets
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['PROVISIONING_PROFILE'] = 'None'
      config.build_settings['CODE_SIGN_IDENTITY'] = ''
      config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO' 
    end
  end

  # Disable code signing for resource bundle targets
  installer.target_installation_results.pod_target_installation_results
    .each do |pod_name, target_installation_result|
    target_installation_result.resource_bundle_targets.each do |resource_bundle_target|
      resource_bundle_target.build_configurations.each do |config|
        config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
        config.build_settings['PROVISIONING_PROFILE'] = 'None' 
        config.build_settings['CODE_SIGN_IDENTITY'] = '' 
      end
    end
  end

  # Fix for React Native Firebase when using static frameworks
  # ROOT CAUSE: Static frameworks with modules enabled create strict module boundaries.
  # When RNFBMessaging imports <RNFBApp/...>, the module system expects ALL types to be
  # visible through RNFBApp's module exports. But RCTPromiseRejectBlock is in React-Core,
  # and RNFBApp doesn't re-export it. The module system blocks access even if headers exist.
  # 
  # SOLUTION: Disable modules for RNFB targets entirely. This makes the compiler use
  # traditional #import header inclusion instead of strict module boundaries.
  installer.pods_project.targets.each do |target|
    if target.name.start_with?('RNFB')
      target.build_configurations.each do |config|
        # DISABLE modules - this is the key fix
        # Without modules, the compiler uses traditional header inclusion and can find
        # React-Core types through the header search paths
        config.build_settings['CLANG_ENABLE_MODULES'] = 'NO'
        
        # Ensure header maps are enabled so headers can be found
        config.build_settings['USE_HEADERMAP'] = 'YES'
        
        # Add React-Core headers to search paths so they can be found via #import
        header_search_paths = config.build_settings['HEADER_SEARCH_PATHS'] || '$(inherited)'
        react_core_path = File.join(installer.sandbox.root, 'Headers', 'Public', 'React-Core')
        react_core_path_quoted = '"' + react_core_path + '"'
        if header_search_paths.is_a?(Array)
          unless header_search_paths.any? { |path| path.include?('React-Core') }
            header_search_paths << react_core_path_quoted
          end
        elsif header_search_paths.is_a?(String)
          unless header_search_paths.include?('React-Core')
            config.build_settings['HEADER_SEARCH_PATHS'] = [header_search_paths, react_core_path_quoted]
          end
        else
          config.build_settings['HEADER_SEARCH_PATHS'] = ['$(inherited)', react_core_path_quoted]
        end
      end
    end
  end

end`;

module.exports = {
  newPostInstallBlock
}