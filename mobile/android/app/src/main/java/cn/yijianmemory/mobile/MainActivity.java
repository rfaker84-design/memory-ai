package cn.yijianmemory.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MemoryMediaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
