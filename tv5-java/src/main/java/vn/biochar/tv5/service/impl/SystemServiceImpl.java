package vn.biochar.tv5.service.impl;

import java.util.*;
import org.springframework.stereotype.Service;
import vn.biochar.tv5.dao.ISystemDao;
import vn.biochar.tv5.service.ISystemService;

@Service
public class SystemServiceImpl implements ISystemService {
    private final ISystemDao dao;
    public SystemServiceImpl(ISystemDao dao) { this.dao = dao; }
    @Override
    public Map<String,Object> health() { return Map.of("status", "ok", "backend", "java", "database", dao.currentDatabase().get("name")); }
    @Override
    public Map<String,Object> access(UUID id) { return dao.userAccess(id); }
    @Override
    public Map<String,Object> activeActor(String name) { return dao.activeActor(name); }
    @Override
    public Map<String,Object> datasetStatus(UUID id) { return dao.datasetStatus(id); }
    @Override
    public List<Map<String,Object>> activeDefinitions() { return dao.activeDefinitions(); }
}
